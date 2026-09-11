import type {
  ApiError,
  CameraListResponse,
  CameraStatusResponse,
} from "../../../shared/src/models/camera";
const base = new URL("./", window.location.href);
export const apiUrl = (path: string) => new URL(`api/${path}`, base).href;
export class RequestError extends Error {
  constructor(
    message: string,
    public retryable = true,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  signal: AbortSignal,
  method = "GET",
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    signal,
    method,
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new RequestError(
      body?.error.message || "Il server non è raggiungibile.",
      body?.error.retryable ?? true,
    );
  }
  return response.json() as Promise<T>;
}
export const listCameras = (signal: AbortSignal, refresh = false) =>
  request<CameraListResponse>(
    `cameras${refresh ? "/refresh" : ""}`,
    signal,
    refresh ? "POST" : "GET",
  );
export const cameraStatus = (id: string, signal: AbortSignal) =>
  request<CameraStatusResponse>(`cameras/${encodeURIComponent(id)}`, signal);
