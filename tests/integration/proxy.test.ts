import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { readConfig } from "../../server/src/config/index.js";
import { createApp } from "../../server/src/app.js";
import { CameraRegistry } from "../../server/src/cameras/registry.js";
import { StreamManager } from "../../server/src/capture/manager.js";
import { FakeCapture, FakeDiscovery } from "../fixtures/fakes.js";

function post(url: string, headers: Record<string, string>) {
  return new Promise<number>((resolve, reject) => {
    const req = request(url, { method: "POST", headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end();
  });
}

for (const hops of ["0", "1"])
  test(`HTTPS origin through proxy with TRUST_PROXY_HOPS=${hops}`, async (t) => {
    const config = readConfig({
      BASE_PATH: "/cameras/",
      TRUST_PROXY_HOPS: hops,
    });
    const registry = new CameraRegistry(new FakeDiscovery());
    await registry.refresh();
    const manager = new StreamManager(config, new FakeCapture());
    const server = createApp({
      config,
      registry,
      manager,
      ready: async () => true,
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      await manager.shutdown();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/cameras/api/cameras/refresh`;
    const headers = {
      Host: "front.example:55443",
      Origin: "https://front.example:55443",
      "X-Forwarded-Proto": "https",
      "Sec-Fetch-Site": "same-origin",
    };
    assert.equal(
      await post(url, headers),
      hops === "1" ? 200 : 400,
    );
    assert.equal(
      await post(url, {
        ...headers,
        Origin: "https://foreign.example",
      }),
      400,
    );
  });
