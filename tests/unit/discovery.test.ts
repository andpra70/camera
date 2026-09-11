import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  V4LDiscovery,
  type DiscoveryIO,
} from "../../server/src/cameras/discovery.js";
import { readConfig } from "../../server/src/config/index.js";
test("discovery isolates permission failures, filters metadata and groups capture endpoints", async () => {
  const info = await readFile("tests/fixtures/v4l-capture.txt", "utf8");
  const formats = await readFile("tests/fixtures/v4l-formats.txt", "utf8");
  const io: DiscoveryIO = {
    names: async (path) =>
      path === "/dev"
        ? ["video0", "video1", "video2", "video3", "video4", "console"]
        : ["usb-camera-video-index0"],
    characterDevice: async (path) => path !== "/dev/video4",
    realpath: async () => "/dev/video0",
    probe: async (_binary, args) => {
      if (args[1] === "/dev/video2") throw new Error("Permission denied");
      if (args[2] === "--list-formats-ext") return formats;
      if (args[1] === "/dev/video1")
        return info.replace(
          "Device Caps      : 0x04200001",
          "Device Caps      : 0x04a00000",
        );
      return info;
    },
  };
  const discovery = new V4LDiscovery(readConfig({}), io);
  const cameras = await discovery.scan();
  assert.deepEqual(
    cameras.map((c) => c.deviceName),
    ["video0", "video2", "video3"],
  );
  assert.equal(cameras[0].physicalGroupId, cameras[2].physicalGroupId);
  assert.notEqual(cameras[0].id, cameras[2].id);
  assert.equal(cameras[0].identityPersistence, "persistent");
  assert.equal(cameras[1].availability, "permission_denied");
  assert.equal(cameras[1].selectedProfile, null);
  assert.equal((await discovery.scan())[0].id, cameras[0].id);
  assert.equal(
    (await new V4LDiscovery(readConfig({}), io).scan())[0].id,
    cameras[0].id,
  );
  const filtered = await new V4LDiscovery(
    readConfig({ CAMERA_ALLOWLIST: "/dev/video3" }),
    io,
  ).scan();
  assert.deepEqual(
    filtered.map((c) => c.deviceName),
    ["video3"],
  );
});
test("empty host produces empty inventory without probing", async () => {
  const io: DiscoveryIO = {
    names: async () => [],
    characterDevice: async () => false,
    realpath: async () => "",
    probe: async () => {
      throw new Error("unexpected probe");
    },
  };
  assert.deepEqual(await new V4LDiscovery(readConfig({}), io).scan(), []);
});
