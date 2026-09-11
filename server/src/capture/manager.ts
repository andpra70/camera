import type { Camera } from "../../../shared/src/models/camera.js";
import type { Config } from "../config/index.js";
import type { CaptureAdapter, CaptureProcess } from "./adapter.js";
import { AppError } from "../errors.js";
import { log } from "../log.js";
export interface Reader {
  frame(data: Buffer): void;
  error(error: AppError): void;
}
interface Session {
  camera: Camera;
  readers: Set<Reader>;
  process?: CaptureProcess;
  last?: Buffer;
  lastAt: number;
  timer?: NodeJS.Timeout;
  idle?: NodeJS.Timeout;
  stopping: boolean;
  startedAt: number;
}
export class StreamManager {
  private sessions = new Map<string, Session>();
  private closing = new Set<Promise<void>>();
  private shuttingDown = false;
  constructor(
    private config: Config,
    private adapter: CaptureAdapter,
  ) {}
  readers(id: string) {
    return this.sessions.get(id)?.readers.size || 0;
  }
  subscribe(camera: Camera, reader: Reader): () => void {
    if (this.shuttingDown)
      throw new AppError("CAMERA_UNAVAILABLE", "Server in arresto.", 503, true);
    if (camera.availability === "permission_denied")
      throw new AppError(
        "CAMERA_PERMISSION_DENIED",
        "Permessi insufficienti per accedere alla camera.",
      );
    if (!camera.selectedProfile) {
      if (camera.lastError)
        throw new AppError(
          camera.lastError.code,
          camera.lastError.message,
          camera.lastError.code === "CAMERA_BUSY" ? 409 : 503,
          camera.lastError.retryable,
        );
      throw new AppError(
        "UNSUPPORTED_FORMAT",
        "La camera non espone un formato supportato.",
        422,
      );
    }
    let session = this.sessions.get(camera.id);
    if (session?.stopping)
      throw new AppError(
        "CAMERA_UNAVAILABLE",
        "Acquisizione in arresto. Riprovare.",
        503,
        true,
      );
    if (!session) {
      if (this.sessions.size >= this.config.maxCameras)
        throw new AppError(
          "STREAM_LIMIT_REACHED",
          "Limite camere attive raggiunto.",
          429,
          true,
        );
      session = {
        camera,
        readers: new Set(),
        lastAt: 0,
        stopping: false,
        startedAt: Date.now(),
      };
      this.sessions.set(camera.id, session);
    }
    const s = session;
    if (s.readers.size >= this.config.maxClients)
      throw new AppError(
        "STREAM_LIMIT_REACHED",
        "Limite lettori per camera raggiunto.",
        429,
        true,
      );
    if (s.idle) clearTimeout(s.idle);
    s.readers.add(reader);
    if (!s.process) {
      camera.captureState = "starting";
      camera.lastError = null;
      camera.lastFrameAt = null;
      s.timer = setTimeout(
        () =>
          this.fail(
            s,
            new AppError(
              "CAPTURE_TIMEOUT",
              "La camera non ha prodotto immagini in tempo.",
              504,
              true,
            ),
          ),
        this.config.startTimeout,
      );
      log("info", "capture_start", { cameraId: camera.id });
      try {
        s.process = this.adapter.start(
          camera,
          (data) => this.frame(s, data),
          (error) => this.fail(s, error),
        );
        if (s.stopping) void s.process.stop();
      } catch (error) {
        this.fail(
          s,
          error instanceof AppError
            ? error
            : new AppError(
                "CAMERA_UNAVAILABLE",
                "Acquisizione non riuscita.",
                503,
                true,
              ),
        );
      }
    } else if (s.last && Date.now() - s.lastAt <= 2000) {
      queueMicrotask(() => {
        if (s.readers.has(reader) && !s.stopping && s.last)
          reader.frame(s.last);
      });
    }
    return () => {
      s.readers.delete(reader);
      if (!s.readers.size && !s.stopping) {
        if (s.idle) clearTimeout(s.idle);
        s.idle = setTimeout(() => this.stop(s), this.config.idleTimeout);
      }
    };
  }
  private frame(s: Session, data: Buffer) {
    if (s.stopping) return;
    s.last = data;
    s.lastAt = Date.now();
    s.camera.captureState = "streaming";
    s.camera.availability = "available";
    s.camera.lastFrameAt = new Date(s.lastAt).toISOString();
    s.camera.lastError = null;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(
      () =>
        this.fail(
          s,
          new AppError(
            "CAPTURE_TIMEOUT",
            "Il flusso della camera si è interrotto.",
            504,
            true,
          ),
        ),
      this.config.stallTimeout,
    );
    for (const reader of [...s.readers]) reader.frame(data);
  }
  private fail(s: Session, error: AppError) {
    if (s.stopping) return;
    s.camera.captureState = "error";
    s.camera.lastError = error.publicData();
    s.camera.availability =
      error.code === "CAMERA_PERMISSION_DENIED"
        ? "permission_denied"
        : error.code === "CAMERA_BUSY"
          ? "busy"
          : error.code === "UNSUPPORTED_FORMAT"
            ? "unsupported"
            : "disconnected";
    log("warn", "capture_failed", { cameraId: s.camera.id, code: error.code });
    const readers = [...s.readers];
    this.stop(s);
    for (const reader of readers) reader.error(error);
  }
  private stop(s: Session) {
    if (s.stopping) return;
    s.stopping = true;
    clearTimeout(s.timer);
    clearTimeout(s.idle);
    s.readers.clear();
    s.last = undefined;
    if (s.camera.captureState !== "error") s.camera.captureState = "idle";
    const pending = Promise.resolve()
      .then(() => s.process?.stop())
      .then(() => {
        if (this.sessions.get(s.camera.id) === s)
          this.sessions.delete(s.camera.id);
        log("info", "capture_stop", {
          cameraId: s.camera.id,
          durationMs: Date.now() - s.startedAt,
        });
      })
      .finally(() => this.closing.delete(pending));
    this.closing.add(pending);
  }
  disconnect(id: string) {
    const s = this.sessions.get(id);
    if (s)
      this.fail(
        s,
        new AppError("CAMERA_UNAVAILABLE", "Camera scollegata.", 503, true),
      );
  }
  async shutdown() {
    this.shuttingDown = true;
    for (const s of this.sessions.values())
      this.fail(
        s,
        new AppError("CAMERA_UNAVAILABLE", "Server in arresto.", 503, true),
      );
    await Promise.allSettled([...this.closing]);
  }
}
