import { readdir, stat, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import type { Camera } from "../../../shared/src/models/camera.js";
import type { Config } from "../config/index.js";
import { captureError } from "../errors.js";
import { command } from "./probe.js";
import { captureCapable, parseProfiles } from "./profiles.js";
export interface Discovery {
  scan(): Promise<Camera[]>;
}
export interface DiscoveryIO {
  names(path: string): Promise<string[]>;
  characterDevice(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  probe(binary: string, args: string[]): Promise<string>;
}
const systemIO: DiscoveryIO = {
  names: (path) => readdir(path),
  characterDevice: async (path) =>
    Boolean((await stat(path).catch(() => null))?.isCharacterDevice()),
  realpath,
  probe: command,
};
export class V4LDiscovery implements Discovery {
  private session = randomUUID();
  constructor(
    private config: Config,
    private io: DiscoveryIO = systemIO,
  ) {}
  async scan(): Promise<Camera[]> {
    const names = (await this.io.names("/dev"))
      .filter((n) => /^video\d+$/.test(n))
      .sort();
    const cameras: Camera[] = [];
    const persistent = new Map<string, string>();
    for (const name of await this.io
      .names("/dev/v4l/by-id")
      .catch(() => [] as string[])) {
      const path = await this.io
        .realpath(`/dev/v4l/by-id/${name}`)
        .catch(() => "");
      if (path) persistent.set(path, name);
    }
    // Sequential probing bounds subprocesses and avoids hammering USB devices.
    for (const name of names) {
      const path = `/dev/${name}`;
      if (this.config.allowlist.length && !this.config.allowlist.includes(path))
        continue;
      if (!(await this.io.characterDevice(path))) continue;
      const identity = persistent.get(path);
      const camera: Camera = {
        id: createHash("sha256")
          .update(identity || `${this.session}:${path}`)
          .digest("hex")
          .slice(0, 24),
        label: name,
        deviceName: name,
        identityPersistence: identity ? "persistent" : "session",
        availability: "unknown",
        captureState: "idle",
        profiles: [],
        selectedProfile: null,
        lastFrameAt: null,
        lastError: null,
      };
      try {
        const info = await this.io.probe("v4l2-ctl", [
          "--device",
          path,
          "--info",
        ]);
        if (!captureCapable(info)) continue;
        camera.label = info.match(/Card type\s*:\s*(.+)/)?.[1].trim() || name;
        const bus = info.match(/Bus info\s*:\s*(.+)/)?.[1].trim();
        if (bus)
          camera.physicalGroupId = createHash("sha256")
            .update(bus)
            .digest("hex")
            .slice(0, 12);
        const native = await this.io.probe("v4l2-ctl", [
          "--device",
          path,
          "--list-formats-ext",
        ]);
        camera.profiles = parseProfiles(native, this.config);
        camera.selectedProfile = camera.profiles[0] || null;
        if (!camera.selectedProfile) camera.availability = "unsupported";
      } catch (error) {
        const err = captureError(String(error));
        camera.availability =
          err.code === "CAMERA_PERMISSION_DENIED"
            ? "permission_denied"
            : err.code === "CAMERA_BUSY"
              ? "busy"
              : "unknown";
        camera.lastError = err.publicData();
      }
      cameras.push(camera);
    }
    return cameras;
  }
}
