import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/src/app.js";
import { CameraRegistry } from "../../server/src/cameras/registry.js";
import { StreamManager } from "../../server/src/capture/manager.js";
import { readConfig } from "../../server/src/config/index.js";
import { FakeCapture, FakeDiscovery, jpeg } from "../fixtures/fakes.js";
for (const basePath of ["/", "/camera/"])
  test(`HTTP at ${basePath}: contracts, snapshot, stream and cleanup`, async (t) => {
    const config = { ...readConfig({ BASE_PATH: basePath }), idleTimeout: 10 };
    const adapter = new FakeCapture();
    const discovery = new FakeDiscovery();
    const registry = new CameraRegistry(discovery);
    await registry.refresh();
    const manager = new StreamManager(config, adapter);
    const dir = await mkdtemp(join(tmpdir(), "camera-http-"));
    await writeFile(
      join(dir, "index.html"),
      "<!doctype html><title>Camera</title>",
    );
    const server = createApp({
      config,
      registry,
      manager,
      ready: async () => true,
      clientDir: dir,
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      await manager.shutdown();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true });
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const root = origin + basePath;
    assert.equal((await fetch(root)).status, 200);
    assert.equal((await fetch(root + "api/ready")).status, 200);
    assert.equal((await fetch(root + "api/health")).status, 200);
    assert.equal((await fetch(root + "assets/missing.js")).status, 404);
    assert.equal(
      (await fetch(root + "api/missing")).headers
        .get("content-type")
        ?.includes("json"),
      true,
    );
    const list = await (await fetch(root + "api/cameras")).json();
    assert.equal(list.cameras.length, 1);
    assert.equal(
      (await fetch(root + "api/cameras/not-a-device/snapshot")).status,
      404,
    );
    assert.equal(
      (
        await fetch(root + "api/cameras/refresh", {
          method: "POST",
          headers: { origin: "https://foreign.example" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(root + "api/cameras/refresh", {
          method: "POST",
          headers: { origin },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(root + "api/cameras/refresh", {
          method: "POST",
          headers: { origin },
        })
      ).status,
      429,
    );
    if (basePath !== "/") {
      assert.equal((await fetch(origin + "/api/cameras")).status, 404);
      assert.equal(
        (await fetch(root.slice(0, -1), { redirect: "manual" })).headers.get(
          "location",
        ),
        basePath,
      );
    }
    const snapshot = fetch(root + "api/cameras/test-camera/snapshot");
    for (let i = 0; i < 100 && !adapter.emit; i++) await delay(5);
    adapter.emit!(jpeg);
    const response = await snapshot;
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
    const controller = new AbortController();
    const stream = await fetch(root + "api/cameras/test-camera/stream", {
      signal: controller.signal,
    });
    assert.match(
      stream.headers.get("content-type")!,
      /multipart\/x-mixed-replace/,
    );
    const reader = stream.body!.getReader();
    const first = await reader.read();
    assert.match(
      Buffer.from(first.value!).toString("latin1"),
      /Content-Length: 19/,
    );
    assert.equal(adapter.starts, 1);
    controller.abort();
    await reader.cancel().catch(() => {});
    await delay(40);
    assert.equal(manager.readers("test-camera"), 0);
    assert.equal(adapter.stops, 1);
  });
