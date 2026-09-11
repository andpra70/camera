import type { CameraError } from "../../shared/src/models/camera.js";
export class AppError extends Error implements CameraError {
  constructor(
    public code: string,
    message: string,
    public status = 503,
    public retryable = false,
  ) {
    super(message);
  }
  publicData(): CameraError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}
export function captureError(text: string): AppError {
  if (/permission denied|operation not permitted/i.test(text))
    return new AppError(
      "CAMERA_PERMISSION_DENIED",
      "Permessi insufficienti per accedere alla camera.",
    );
  if (/busy/i.test(text))
    return new AppError(
      "CAMERA_BUSY",
      "Camera occupata da un altro programma.",
      409,
      true,
    );
  if (/not supported|invalid argument|unknown input format/i.test(text))
    return new AppError(
      "UNSUPPORTED_FORMAT",
      "Formato di acquisizione non supportato.",
      422,
    );
  return new AppError(
    "CAMERA_UNAVAILABLE",
    "La camera non è disponibile o è stata scollegata.",
    503,
    true,
  );
}
