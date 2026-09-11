import { readFile } from "node:fs/promises";
import { readConfig } from "../../server/src/config/index.js";
import { CameraRegistry } from "../../server/src/cameras/registry.js";
import { StreamManager } from "../../server/src/capture/manager.js";
import { createApp } from "../../server/src/app.js";
import { camera, FakeDiscovery } from "../fixtures/fakes.js";
import { AppError } from "../../server/src/errors.js";
const config = readConfig();
const discovery = new FakeDiscovery();
discovery.cameras = [camera("uno"), camera("due"), camera("occupata")];
const registry = new CameraRegistry(discovery);
await registry.start(10000);
const jpeg = await readFile("tests/fixtures/frame.jpg");
const manager = new StreamManager(config, {
  start: (cam, frame, fail) => {
    const timer = setInterval(
      () =>
        cam.id === "occupata"
          ? fail(
              new AppError(
                "CAMERA_BUSY",
                "Camera occupata da un altro programma.",
                409,
                true,
              ),
            )
          : frame(jpeg),
      100,
    );
    return { stop: async () => clearInterval(timer) };
  },
});
const server = createApp({
  config,
  registry,
  manager,
  ready: async () => true,
}).listen(config.port, "127.0.0.1");
async function stop() {
  registry.stop();
  await manager.shutdown();
  server.closeAllConnections();
  server.close();
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
