import type { CameraProfile } from "../../../shared/src/models/camera.js";
import type { Config } from "../config/index.js";
const formats: Record<string, string> = {
  MJPG: "mjpeg",
  JPEG: "mjpeg",
  YUYV: "yuyv422",
  UYVY: "uyvy422",
  NV12: "nv12",
  YU12: "yuv420p",
  RGB3: "rgb24",
  BGR3: "bgr24",
  GREY: "gray",
  H264: "h264",
};
export function captureCapable(info: string): boolean {
  const device = info.match(/Device Caps\s*:\s*(0x[\da-f]+)/i);
  const global = info.match(/Capabilities\s*:\s*(0x[\da-f]+)/i);
  const caps = global ? Number.parseInt(global[1], 16) : 0;
  const effective =
    (caps & 0x80000000) !== 0
      ? device
        ? Number.parseInt(device[1], 16)
        : 0
      : caps;
  return Boolean(effective & (0x1 | 0x1000));
}
export function parseProfiles(
  text: string,
  config: Pick<Config, "width" | "height" | "fps">,
): CameraProfile[] {
  const profiles: CameraProfile[] = [];
  let format = "";
  let width = 0;
  let height = 0;
  const add = (seconds: number, exactFps?: number) => {
    if (
      !format ||
      !width ||
      !height ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      return;
    const denominator = Math.round(seconds * 1_000_000);
    if (!denominator) return;
    const fps = exactFps
      ? { numerator: Math.round(exactFps * 1000), denominator: 1000 }
      : { numerator: 1_000_000, denominator };
    const id = `${format}-${width}x${height}-${fps.numerator}_${fps.denominator}`;
    if (!profiles.some((p) => p.id === id))
      profiles.push({
        id,
        inputFormat: format,
        width,
        height,
        fps,
        output: {
          width,
          height,
          fps: Math.min(config.fps, fps.numerator / fps.denominator),
        },
      });
  };
  for (const line of text.split("\n")) {
    const f = line.match(/\[\d+\]:\s*'(.{4})'/);
    if (f) {
      format = formats[f[1]] || "";
      width = height = 0;
    }
    const discrete = line.match(/Size: Discrete (\d+)x(\d+)/);
    if (discrete) {
      width = +discrete[1];
      height = +discrete[2];
    }
    const range = line.match(
      /Size: (?:Stepwise|Continuous) (\d+)x(\d+) - (\d+)x(\d+)(?: with step (\d+)\/(\d+))?/,
    );
    if (range) {
      const choose = (target: number, min: number, max: number, step: number) =>
        min +
        Math.floor((Math.max(min, Math.min(max, target)) - min) / step) * step;
      width = choose(config.width, +range[1], +range[3], +(range[5] || 1));
      height = choose(config.height, +range[2], +range[4], +(range[6] || 1));
    }
    const interval = line.match(
      /Interval: Discrete ([\d.]+)s(?: \(([\d.]+) fps\))?/,
    );
    if (interval)
      add(
        interval[2] ? 1 / +interval[2] : +interval[1],
        interval[2] ? +interval[2] : undefined,
      );
    const intervals = line.match(
      /Interval: (?:Stepwise|Continuous) ([\d.]+)s - ([\d.]+)s(?: with step ([\d.]+)s)?/,
    );
    if (intervals) {
      const min = +intervals[1],
        max = +intervals[2],
        step = +(intervals[3] || 0);
      let value = Math.max(min, Math.min(max, 1 / config.fps));
      if (step > 0)
        value = min + Math.floor((value - min) / step + 1e-8) * step;
      add(value);
    }
  }
  return profiles.sort((a, b) => {
    const score = (p: CameraProfile) => [
      p.width > config.width || p.height > config.height ? 1 : 0,
      Math.abs(p.width - config.width) + Math.abs(p.height - config.height),
      p.inputFormat === "mjpeg" ? 0 : 1,
      Math.abs(p.fps.numerator / p.fps.denominator - config.fps),
    ];
    const aa = score(a),
      bb = score(b);
    for (let i = 0; i < aa.length; i++)
      if (aa[i] !== bb[i]) return aa[i] - bb[i];
    return a.id.localeCompare(b.id);
  });
}
