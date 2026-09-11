import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { FFmpegAdapter } from "../../server/src/capture/adapter.js";
import { command } from "../../server/src/cameras/probe.js";
import { JpegParser } from "../../server/src/capture/jpeg.js";
import { camera } from "../fixtures/fakes.js";
test("parser reconstructs a real FFmpeg JPEG through irregular chunks", async () => {
  const jpeg = await readFile("tests/fixtures/frame.jpg");
  const frames: Buffer[] = [];
  const parser = new JpegParser((frame) => frames.push(frame));
  const both = Buffer.concat([jpeg, jpeg]);
  for (let i = 0; i < both.length; i += 137)
    parser.push(both.subarray(i, i + 137));
  assert.deepEqual(frames, [jpeg, jpeg]);
});
test("probe process timeout and missing binary reject without hanging", async () => {
  await assert.rejects(
    command(process.execPath, ["-e", "setInterval(() => {}, 1000)"], 40),
    /timeout/,
  );
  await assert.rejects(command("/missing/camera-probe", []));
});
test("adapter escalates SIGTERM to SIGKILL and waits for child exit", async () => {
  let child!: ChildProcess;
  const launch = ((_binary: string, _args: string[], options: object) => {
    child = spawn(
      process.execPath,
      [
        "-e",
        'process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1000)',
      ],
      options,
    );
    return child;
  }) as typeof spawn;
  const adapter = new FFmpegAdapter(launch);
  let failed = false;
  const processHandle = adapter.start(
    camera(),
    () => {},
    () => {
      failed = true;
    },
  );
  await once(child.stdout!, "data");
  await processHandle.stop();
  assert.equal(child.signalCode, "SIGKILL");
  assert.equal(failed, false);
  await processHandle.stop();
});
test("adapter reports executable-not-found as dependency error", async () => {
  const launch = ((_binary: string, args: string[], options: object) =>
    spawn("/missing/camera-ffmpeg", args, options)) as typeof spawn;
  const adapter = new FFmpegAdapter(launch);
  let resolve!: (code: string) => void;
  const failure = new Promise<string>((r) => {
    resolve = r;
  });
  const processHandle = adapter.start(
    camera(),
    () => {},
    (error) => resolve(error.code),
  );
  assert.equal(await failure, "DEPENDENCY_UNAVAILABLE");
  await processHandle.stop();
});
