import type { Camera } from "../../shared/src/models/camera.js";
import type { CaptureAdapter } from "../../server/src/capture/adapter.js";
import type { Discovery } from "../../server/src/cameras/discovery.js";
import { AppError } from "../../server/src/errors.js";
// Synthetic protocol JPEG for parser/HTTP tests, not a claimed hardware capture.
export const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 4, 0xff, 0xd9, 0xff, 0xda, 0, 2, 1, 2, 0xff, 0, 3,
  0xff, 0xd9,
]);
export function camera(id = "test-camera"): Camera {
  const profile = {
    id: "mjpeg-640",
    inputFormat: "mjpeg",
    width: 640,
    height: 480,
    fps: { numerator: 15, denominator: 1 },
    output: { width: 640, height: 480, fps: 15 },
  };
  return {
    id,
    label: `Camera ${id}`,
    deviceName: "video0",
    identityPersistence: "session",
    availability: "unknown",
    captureState: "idle",
    profiles: [profile],
    selectedProfile: profile,
    lastFrameAt: null,
    lastError: null,
  };
}
export class FakeDiscovery implements Discovery {
  cameras = [camera()];
  calls = 0;
  failure = false;
  async scan() {
    this.calls++;
    if (this.failure) throw new Error("Scan failure");
    return structuredClone(this.cameras);
  }
}
export class FakeCapture implements CaptureAdapter {
  starts = 0;
  stops = 0;
  emit?: (frame: Buffer) => void;
  fail?: (error: AppError) => void;
  start(
    _camera: Camera,
    frame: (frame: Buffer) => void,
    fail: (error: AppError) => void,
  ) {
    this.starts++;
    this.emit = frame;
    this.fail = fail;
    let stopped = false;
    return {
      stop: async () => {
        if (!stopped) {
          this.stops++;
          stopped = true;
        }
      },
    };
  }
}
