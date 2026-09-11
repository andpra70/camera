import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { serveImages } from "../../server/src/capture/http.js";
import { StreamManager } from "../../server/src/capture/manager.js";
import { readConfig } from "../../server/src/config/index.js";
import { FakeCapture, camera, jpeg } from "../fixtures/fakes.js";
class FakeResponse extends EventEmitter {
  locals = {};
  headersSent = false;
  destroyed = false;
  writes: Buffer[] = [];
  writable = false;
  status() {
    return this;
  }
  set() {
    return this;
  }
  write(frame: Buffer) {
    this.headersSent = true;
    this.writes.push(frame);
    return this.writable;
  }
  destroy() {
    this.destroyed = true;
    this.emit("close");
  }
}
test("slow client retains only newest pending frame and does not block other readers", async () => {
  const adapter = new FakeCapture();
  const manager = new StreamManager(readConfig({}), adapter);
  const cam = camera();
  const slow = new FakeResponse();
  const fast = new FakeResponse();
  fast.writable = true;
  for (const res of [slow, fast])
    serveImages(
      manager,
      cam,
      false,
      8000,
      {} as Request,
      res as unknown as Response,
      (error) => {
        throw error;
      },
    );
  adapter.emit!(jpeg);
  adapter.emit!(jpeg);
  adapter.emit!(jpeg);
  assert.equal(slow.writes.length, 1);
  assert.equal(fast.writes.length, 3);
  slow.writable = true;
  slow.emit("drain");
  assert.equal(slow.writes.length, 2);
  slow.destroy();
  fast.destroy();
  await manager.shutdown();
});
