import type { Request, Response, NextFunction } from "express";
import type { Camera } from "../../../shared/src/models/camera.js";
import { StreamManager } from "./manager.js";
import { AppError } from "../errors.js";
export function serveImages(
  manager: StreamManager,
  camera: Camera,
  snapshot: boolean,
  timeout: number,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  let unsubscribe: (() => void) | undefined;
  let done = false;
  let blocked = false;
  let pending: Buffer | undefined;
  let slowTimer: NodeJS.Timeout | undefined;
  const firstTimer = setTimeout(
    () =>
      fail(
        new AppError(
          "CAPTURE_TIMEOUT",
          "Nessun fotogramma disponibile.",
          504,
          true,
        ),
      ),
    timeout,
  );
  const cleanup = () => {
    if (done) return;
    done = true;
    clearTimeout(firstTimer);
    clearTimeout(slowTimer);
    pending = undefined;
    unsubscribe?.();
    res.off("drain", drain);
    res.off("close", cleanup);
  };
  const fail = (error: AppError) => {
    if (done) return;
    cleanup();
    if (res.headersSent) res.destroy();
    else next(error);
  };
  const write = (frame: Buffer) => {
    if (done || res.destroyed) return;
    const part = Buffer.concat([
      Buffer.from(
        `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`,
      ),
      frame,
      Buffer.from("\r\n"),
    ]);
    blocked = !res.write(part);
    if (blocked)
      slowTimer = setTimeout(() => {
        cleanup();
        res.destroy();
      }, 10000);
  };
  const drain = () => {
    blocked = false;
    clearTimeout(slowTimer);
    if (pending) {
      const frame = pending;
      pending = undefined;
      write(frame);
    }
  };
  res.on("close", cleanup);
  res.on("drain", drain);
  try {
    unsubscribe = manager.subscribe(camera, {
      frame: (frame) => {
        if (done) return;
        clearTimeout(firstTimer);
        if (snapshot) {
          res.type("jpeg").set("Cache-Control", "no-store").send(frame);
          cleanup();
          return;
        }
        if (!res.headersSent)
          res.status(200).set({
            "Content-Type": "multipart/x-mixed-replace; boundary=frame",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          });
        if (blocked) pending = frame;
        else write(frame);
      },
      error: fail,
    });
    if (done) unsubscribe();
  } catch (error) {
    cleanup();
    next(error);
  }
}
