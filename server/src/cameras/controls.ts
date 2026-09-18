import type {
  CameraControl,
  CameraControlsResponse,
} from "../../../shared/src/models/camera.js";
import type { Camera } from "../../../shared/src/models/camera.js";
import { AppError } from "../errors.js";
import { command } from "./probe.js";

export interface CameraControls {
  list(camera: Camera): Promise<CameraControlsResponse>;
  set(
    camera: Camera,
    name: string,
    value: number,
  ): Promise<CameraControlsResponse>;
}

const label = (name: string) =>
  name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function parseControls(output: string): CameraControl[] {
  const controls: CameraControl[] = [];
  let current: CameraControl | undefined;
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      /^\s*([a-zA-Z0-9_]+)\s+0x[0-9a-f]+\s+\((int|bool|menu)\)\s*:\s*(.*)$/i,
    );
    if (match) {
      const [, name, rawType, attributes] = match;
      if (/flags=.*(?:inactive|read-only|disabled)/i.test(attributes)) {
        current = undefined;
        continue;
      }
      const number = (key: string, fallback: number) =>
        Number(
          attributes.match(new RegExp(`(?:^|\\s)${key}=(-?\\d+)`))?.[1] ??
            fallback,
        );
      const type =
        rawType === "bool" ? "boolean" : rawType === "int" ? "integer" : "menu";
      current = {
        name,
        label: label(name),
        type,
        min: type === "boolean" ? 0 : number("min", 0),
        max: type === "boolean" ? 1 : number("max", 0),
        step: type === "boolean" ? 1 : number("step", 1),
        defaultValue: number("default", 0),
        value: number("value", 0),
        ...(type === "menu" ? { options: [] } : {}),
      };
      controls.push(current);
      continue;
    }
    const option = line.match(/^\s+(\d+):\s*(.+)$/);
    if (current?.type === "menu" && option)
      current.options!.push({
        value: Number(option[1]),
        label: option[2].trim(),
      });
  }
  return controls;
}

export class V4LCameraControls implements CameraControls {
  async list(camera: Camera) {
    const output = await command("v4l2-ctl", [
      "--device",
      `/dev/${camera.deviceName}`,
      "--list-ctrls-menus",
    ]).catch(() => {
      throw new AppError(
        "CAMERA_CONTROLS_UNAVAILABLE",
        "Impostazioni della camera non disponibili.",
        503,
        true,
      );
    });
    return { controls: parseControls(output) };
  }

  async set(camera: Camera, name: string, value: number) {
    const current = await this.list(camera);
    const control = current.controls.find((item) => item.name === name);
    const validStep = control && (value - control.min) % control.step === 0;
    const validOption =
      control?.type !== "menu" ||
      control.options?.some((option) => option.value === value);
    if (
      !control ||
      !Number.isSafeInteger(value) ||
      value < control.min ||
      value > control.max ||
      !validStep ||
      !validOption
    )
      throw new AppError(
        "INVALID_CAMERA_CONTROL",
        "Valore dell’impostazione non valido.",
        400,
      );
    await command("v4l2-ctl", [
      "--device",
      `/dev/${camera.deviceName}`,
      `--set-ctrl=${name}=${value}`,
    ]).catch(() => {
      throw new AppError(
        "CAMERA_CONTROL_FAILED",
        "Impossibile applicare l’impostazione alla camera.",
        409,
        true,
      );
    });
    return this.list(camera);
  }
}
