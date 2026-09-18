import { EventEmitter } from "node:events";
import type {
  Camera,
  CameraListResponse,
} from "../../../shared/src/models/camera.js";
import type { Discovery } from "./discovery.js";
import { AppError } from "../errors.js";
import { log } from "../log.js";
export class CameraRegistry extends EventEmitter {
  private cameras = new Map<string, Camera>();
  private scannedAt: string | null = null;
  private stale = true;
  private diagnostics: string[] = [];
  private pending?: Promise<CameraListResponse>;
  private timer?: NodeJS.Timeout;
  constructor(private discovery: Discovery) {
    super();
  }
  get(id: string): Camera {
    const camera = this.cameras.get(id);
    if (!camera)
      throw new AppError(
        "CAMERA_NOT_FOUND",
        "Camera non trovata. Aggiornare l’elenco.",
        404,
      );
    return camera;
  }
  selectProfile(id: string, profileId: string): Camera {
    const camera = this.get(id);
    const profile = camera.profiles.find(
      (candidate) => candidate.id === profileId,
    );
    if (!profile)
      throw new AppError(
        "INVALID_CAMERA_PROFILE",
        "Definizione non supportata dalla camera.",
        400,
      );
    if (camera.selectedProfile?.id === profile.id) return camera;
    if (
      camera.captureState === "starting" ||
      camera.captureState === "streaming"
    )
      throw new AppError(
        "CAMERA_BUSY",
        "Ferma la visualizzazione prima di cambiare definizione.",
        409,
        true,
      );
    camera.selectedProfile = profile;
    return camera;
  }
  list(): CameraListResponse {
    return {
      cameras: [...this.cameras.values()],
      scannedAt: this.scannedAt,
      stale: this.stale,
      diagnostics: this.diagnostics,
    };
  }
  refresh(): Promise<CameraListResponse> {
    if (this.pending) return this.pending;
    this.pending = this.scan().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async scan() {
    try {
      const found = await this.discovery.scan();
      const next = new Map<string, Camera>();
      for (const candidate of found) {
        const previous = this.cameras.get(candidate.id);
        if (previous) {
          // Capture owns live state. Preserve its object so existing subscribers see updates.
          previous.label = candidate.label;
          if (
            previous.captureState !== "streaming" &&
            previous.captureState !== "starting"
          ) {
            const selectedProfile = candidate.profiles.find(
              (profile) => profile.id === previous.selectedProfile?.id,
            );
            Object.assign(previous, candidate, {
              lastFrameAt: previous.lastFrameAt,
              selectedProfile: selectedProfile || candidate.selectedProfile,
            });
          }
          next.set(candidate.id, previous);
        } else next.set(candidate.id, candidate);
      }
      for (const [id, old] of this.cameras)
        if (!next.has(id)) {
          old.availability = "disconnected";
          this.emit("removed", id);
        }
      this.cameras = next;
      this.scannedAt = new Date().toISOString();
      this.stale = false;
      this.diagnostics = [];
    } catch {
      this.stale = true;
      this.diagnostics = [
        "Inventario non aggiornato: scansione dispositivi non riuscita.",
      ];
      log("warn", "discovery_failed");
    }
    return this.list();
  }
  async start(interval: number) {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), interval);
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
