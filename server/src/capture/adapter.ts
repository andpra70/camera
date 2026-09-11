import { spawn } from "node:child_process";
import type { Camera } from "../../../shared/src/models/camera.js";
import { AppError, captureError } from "../errors.js";
import { JpegParser } from "./jpeg.js";
export interface CaptureProcess {
  stop(): Promise<void>;
}
export interface CaptureAdapter {
  start(
    camera: Camera,
    frame: (data: Buffer) => void,
    fail: (error: AppError) => void,
  ): CaptureProcess;
}
export class FFmpegAdapter implements CaptureAdapter {
  constructor(private spawnProcess: typeof spawn = spawn) {}
  start(
    camera: Camera,
    frame: (data: Buffer) => void,
    fail: (error: AppError) => void,
  ): CaptureProcess {
    const p = camera.selectedProfile;
    if (!p)
      throw new AppError(
        "UNSUPPORTED_FORMAT",
        "Nessun formato supportato.",
        422,
      );
    if (!/^video\d+$/.test(camera.deviceName))
      throw new AppError("INVALID_REQUEST", "Dispositivo non valido.", 400);
    const child = this.spawnProcess(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-f",
        "v4l2",
        "-input_format",
        p.inputFormat,
        "-video_size",
        `${p.width}x${p.height}`,
        "-framerate",
        `${p.fps.numerator}/${p.fps.denominator}`,
        "-i",
        `/dev/${camera.deviceName}`,
        "-an",
        "-vf",
        `fps=${p.output.fps}`,
        "-c:v",
        "mjpeg",
        "-threads",
        "1",
        "-q:v",
        "5",
        "-f",
        "image2pipe",
        "pipe:1",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, LC_ALL: "C" },
      },
    );
    let stderr = "";
    let stopping = false;
    let closed = false;
    let killTimer: NodeJS.Timeout | undefined;
    let resolveClosed!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const stop = () => {
      if (!stopping && !closed) {
        stopping = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
        killTimer.unref();
      }
      return completion;
    };
    const parser = new JpegParser(frame);
    child.stdout.on("data", (data: Buffer) => {
      if (stopping) return;
      try {
        parser.push(data);
      } catch {
        fail(
          new AppError(
            "CAMERA_UNAVAILABLE",
            "Flusso JPEG non valido o troppo grande.",
            503,
            true,
          ),
        );
        void stop();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8192);
    });
    child.on("error", () => {
      if (!stopping)
        fail(
          new AppError("DEPENDENCY_UNAVAILABLE", "Impossibile avviare FFmpeg."),
        );
    });
    child.on("close", () => {
      closed = true;
      if (killTimer) clearTimeout(killTimer);
      resolveClosed();
      if (!stopping) fail(captureError(stderr));
    });
    return { stop };
  }
}
