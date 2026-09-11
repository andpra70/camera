import { readConfig } from "./config/index.js";
import { V4LDiscovery } from "./cameras/discovery.js";
import { CameraRegistry } from "./cameras/registry.js";
import { command } from "./cameras/probe.js";
import { FFmpegAdapter } from "./capture/adapter.js";
import { StreamManager } from "./capture/manager.js";
import { createApp } from "./app.js";
import { log } from "./log.js";
const config = readConfig();
const registry = new CameraRegistry(new V4LDiscovery(config));
const manager = new StreamManager(config, new FFmpegAdapter());
registry.on("removed", (id) => manager.disconnect(id));
const ready = async () => {
  try {
    await Promise.all([
      command("ffmpeg", ["-version"]),
      command("v4l2-ctl", ["--version"]),
    ]);
    return true;
  } catch {
    return false;
  }
};
await registry.start(config.scanInterval);
const app = createApp({ config, registry, manager, ready });
const server = app.listen(config.port, "0.0.0.0", () =>
  log("info", "server_listening", {
    port: config.port,
    basePath: config.basePath,
  }),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  registry.stop();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  await manager.shutdown();
  server.closeAllConnections();
  await closed;
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
server.on("error", (error) => {
  log("error", "server_error", { message: error.message });
  void shutdown().then(() => {
    process.exitCode = 1;
  });
});
