import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readConfig } from "../../server/src/config/index.js";
import {
  captureCapable,
  parseProfiles,
} from "../../server/src/cameras/profiles.js";
import { JpegParser } from "../../server/src/capture/jpeg.js";
import { CameraRegistry } from "../../server/src/cameras/registry.js";
import { FakeDiscovery, jpeg } from "../fixtures/fakes.js";
test("config normalizes context and rejects path/device injection", () => {
  assert.equal(readConfig({ BASE_PATH: "/camera" }).basePath, "/camera/");
  for (const env of [
    { BASE_PATH: "//camera/" },
    { CAMERA_ALLOWLIST: "/etc/passwd" },
    { TARGET_FPS: "0" },
    { PORT: "x" },
  ])
    assert.throws(() => readConfig(env));
});
test("device capabilities exclude metadata even if physical device captures video", async () => {
  const info = await readFile("tests/fixtures/v4l-capture.txt", "utf8");
  assert.equal(captureCapable(info), true);
  assert.equal(
    captureCapable(
      info.replace(
        "Device Caps      : 0x04200001",
        "Device Caps      : 0x04a00000",
      ),
    ),
    false,
  );
  assert.equal(captureCapable("Capabilities : 0x00000002"), false);
});
test("profiles rank supported MJPEG and handle ranges and unknown formats", async () => {
  const profiles = parseProfiles(
    await readFile("tests/fixtures/v4l-formats.txt", "utf8"),
    readConfig({}),
  );
  assert.equal(profiles[0].inputFormat, "mjpeg");
  assert.equal(profiles[0].width, 640);
  assert.equal(profiles[0].fps.numerator / profiles[0].fps.denominator, 15);
  assert.ok(Math.abs(profiles[0].output.fps - 15) < 0.01);
  const range =
    "[0]: 'YUYV'\nSize: Stepwise 320x240 - 1920x1080 with step 16/8\nInterval: Stepwise 0.020s - 0.100s with step 0.010s";
  const result = parseProfiles(
    range,
    readConfig({ TARGET_WIDTH: "650", TARGET_HEIGHT: "490" }),
  );
  assert.equal(result[0].width, 640);
  assert.equal(result[0].height, 488);
  assert.equal(result[0].fps.denominator, 60000);
  assert.deepEqual(
    parseProfiles(range.replace("YUYV", "ZZZZ"), readConfig({})),
    [],
  );
});
test("JPEG parser handles every split, multiple frames, APP markers and stuffing", () => {
  for (let split = 0; split <= jpeg.length; split++) {
    const frames: Buffer[] = [];
    const parser = new JpegParser((frame) => frames.push(frame));
    parser.push(jpeg.subarray(0, split));
    parser.push(Buffer.concat([jpeg.subarray(split), jpeg]));
    assert.deepEqual(frames, [jpeg, jpeg]);
  }
  const frames: Buffer[] = [];
  const parser = new JpegParser((frame) => frames.push(frame));
  for (const byte of jpeg) parser.push(Buffer.from([byte]));
  assert.deepEqual(frames, [jpeg]);
  assert.throws(() => new JpegParser(() => {}, 10).push(jpeg));
  assert.throws(() =>
    new JpegParser(() => {}).push(Buffer.from([255, 216, 255, 224, 0, 1])),
  );
});
test("registry coalesces scans, preserves stale inventory and reports removal", async () => {
  const discovery = new FakeDiscovery();
  const registry = new CameraRegistry(discovery);
  await Promise.all([registry.refresh(), registry.refresh()]);
  assert.equal(discovery.calls, 1);
  discovery.failure = true;
  await registry.refresh();
  assert.equal(registry.list().stale, true);
  assert.equal(registry.list().cameras.length, 1);
  discovery.failure = false;
  discovery.cameras = [];
  let removed = "";
  registry.on("removed", (id) => {
    removed = id;
  });
  await registry.refresh();
  assert.equal(removed, "test-camera");
});
