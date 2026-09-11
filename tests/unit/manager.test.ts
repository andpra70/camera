import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { StreamManager } from "../../server/src/capture/manager.js";
import { readConfig } from "../../server/src/config/index.js";
import { AppError } from "../../server/src/errors.js";
import { FakeCapture, camera, jpeg } from "../fixtures/fakes.js";
const config = () => ({
  ...readConfig({}),
  idleTimeout: 15,
  startTimeout: 25,
  stallTimeout: 30,
});
test("readers share capture; release is independent and idle capture stops", async () => {
  const adapter = new FakeCapture();
  const manager = new StreamManager(config(), adapter);
  const cam = camera();
  let frames = 0;
  const reader = () => ({ frame: () => frames++, error: () => {} });
  const one = manager.subscribe(cam, reader());
  const two = manager.subscribe(cam, reader());
  assert.equal(adapter.starts, 1);
  adapter.emit!(jpeg);
  assert.equal(frames, 2);
  one();
  assert.equal(manager.readers(cam.id), 1);
  assert.equal(adapter.stops, 0);
  two();
  await delay(20);
  assert.equal(adapter.stops, 1);
  await manager.shutdown();
});
test("timeouts, crash and removal notify readers and stop process", async () => {
  for (const mode of ["start", "stall", "crash", "remove"]) {
    const adapter = new FakeCapture();
    const manager = new StreamManager(config(), adapter);
    const cam = camera();
    let code = "";
    manager.subscribe(cam, {
      frame: () => {},
      error: (err) => {
        code = err.code;
      },
    });
    if (mode === "stall") adapter.emit!(jpeg);
    if (mode === "crash")
      adapter.fail!(new AppError("CAMERA_BUSY", "busy", 409, true));
    if (mode === "remove") manager.disconnect(cam.id);
    await delay(45);
    assert.ok(code);
    assert.equal(adapter.stops, 1);
    assert.equal(manager.readers(cam.id), 0);
    await manager.shutdown();
  }
});
test("limits, cancellation during startup and repeated cycles do not leak", async () => {
  const adapter = new FakeCapture();
  const manager = new StreamManager(
    { ...config(), maxClients: 1, maxCameras: 1 },
    adapter,
  );
  const reader = { frame: () => {}, error: () => {} };
  for (let i = 0; i < 20; i++) {
    const release = manager.subscribe(camera(), reader);
    assert.throws(
      () => manager.subscribe(camera(), { ...reader }),
      /Limite lettori/,
    );
    assert.throws(
      () => manager.subscribe(camera("other"), { ...reader }),
      /Limite camere/,
    );
    release();
    await delay(20);
  }
  assert.equal(adapter.starts, 20);
  assert.equal(adapter.stops, 20);
  await manager.shutdown();
});
test("synchronous adapter spawn failure is contained", async () => {
  const manager = new StreamManager(config(), {
    start: () => {
      throw new Error("spawn");
    },
  });
  let called = false;
  manager.subscribe(camera(), {
    frame: () => {},
    error: () => {
      called = true;
    },
  });
  assert.equal(called, true);
  await manager.shutdown();
});
