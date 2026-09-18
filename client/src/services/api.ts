import type {
  ApiError,
  CameraListResponse,
  CameraControlsResponse,
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
  body?: unknown,
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    signal,
    method,
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
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
export const cameraControls = (id: string, signal: AbortSignal) =>
  request<CameraControlsResponse>(
    `cameras/${encodeURIComponent(id)}/controls`,
    signal,
  );
export const updateCameraControl = (
  id: string,
  name: string,
  value: number,
  signal: AbortSignal,
) =>
  request<CameraControlsResponse>(
    `cameras/${encodeURIComponent(id)}/controls/${encodeURIComponent(name)}`,
    signal,
    "PUT",
    { value },
  );
