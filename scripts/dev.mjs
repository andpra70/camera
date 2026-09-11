import { spawn } from "node:child_process";
// Development uses root URLs; production tests cover runtime BASE_PATH independently.
const env = { ...process.env, BASE_PATH: "/", NODE_ENV: "development" };
const children = [
  spawn("node", ["--import", "tsx", "--watch", "server/src/main.ts"], {
    stdio: "inherit",
    env,
  }),
  spawn("npm", ["run", "dev", "-w", "client"], {
    stdio: "inherit",
    env,
    detached: true,
  }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  children[0].kill("SIGTERM");
  if (children[1].pid) {
    try {
      process.kill(-children[1].pid, "SIGTERM");
    } catch {}
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
  child.on("error", () => {
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code || 0;
      stop();
    }
  });
}
