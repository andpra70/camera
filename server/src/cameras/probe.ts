import { spawn } from "node:child_process";
export function command(
  binary: string,
  args: string[],
  timeout = 3000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env: { ...process.env, LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error("Probe timeout");
      child.kill("SIGKILL");
    }, timeout);
    const collect = (chunk: Buffer) => {
      if (output.length + chunk.length > 1024 * 1024) {
        failure = new Error("Probe output limit");
        child.kill("SIGKILL");
      } else output += chunk.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      failure = error;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      failure || code !== 0
        ? reject(failure || new Error(output))
        : resolve(output);
    });
  });
}
