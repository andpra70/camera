export interface Rational {
  numerator: number;
  denominator: number;
}
export interface CameraProfile {
  id: string;
  inputFormat: string;
  width: number;
  height: number;
  fps: Rational;
  output: { width: number; height: number; fps: number };
}
export interface CameraError {
  code: string;
  message: string;
  retryable: boolean;
}
export interface Camera {
  id: string;
  label: string;
  deviceName: string;
  physicalGroupId?: string;
  identityPersistence: "persistent" | "session";
  availability:
    | "unknown"
    | "available"
    | "permission_denied"
    | "unsupported"
    | "disconnected"
    | "busy";
  captureState: "idle" | "starting" | "streaming" | "error";
  profiles: CameraProfile[];
  selectedProfile: CameraProfile | null;
  lastFrameAt: string | null;
  lastError: CameraError | null;
}
export interface CameraListResponse {
  cameras: Camera[];
  scannedAt: string | null;
  stale: boolean;
  diagnostics: string[];
}
export interface CameraStatusResponse extends Camera {
  readers: number;
}
export type CameraControlType = "integer" | "boolean" | "menu";
export interface CameraControlOption {
  value: number;
  label: string;
}
export interface CameraControl {
  name: string;
  label: string;
  type: CameraControlType;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  value: number;
  options?: CameraControlOption[];
}
export interface CameraControlsResponse {
  controls: CameraControl[];
}
export interface ApiError {
  error: CameraError;
  requestId: string;
}
