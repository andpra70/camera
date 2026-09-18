export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const integer = (name: string, fallback: number, max = 3_600_000) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new Error(`Configurazione non valida: ${name}`);
    return value;
  };
  const path = env.BASE_PATH || "/";
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/.test(path))
    throw new Error("BASE_PATH non valido");
  const basePath = path === "/" ? "/" : `${path.replace(/\/$/, "")}/`;
  const allowlist = (env.CAMERA_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.some((p) => !/^\/dev\/video\d+$/.test(p)))
    throw new Error("CAMERA_ALLOWLIST non valida");
  const logLevel = env.LOG_LEVEL || "info";
  if (!["debug", "info", "warn", "error"].includes(logLevel))
    throw new Error("LOG_LEVEL non valido");
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS ?? 0);
  if (trustProxyHops !== 0 && trustProxyHops !== 1)
    throw new Error("TRUST_PROXY_HOPS deve essere 0 oppure 1");
  return {
    port: integer("PORT", 3000, 65535),
    basePath,
    allowlist,
    logLevel,
    trustProxyHops,
    scanInterval: integer("CAMERA_SCAN_INTERVAL_MS", 10000),
    width: integer("TARGET_WIDTH", 640, 7680),
    height: integer("TARGET_HEIGHT", 480, 4320),
    fps: integer("TARGET_FPS", 15, 120),
    maxCameras: integer("MAX_ACTIVE_CAMERAS", 2, 16),
    maxClients: integer("MAX_CLIENTS_PER_CAMERA", 4, 100),
    startTimeout: integer("CAPTURE_START_TIMEOUT_MS", 8000),
    stallTimeout: integer("CAPTURE_STALL_TIMEOUT_MS", 10000),
    idleTimeout: integer("CAPTURE_IDLE_TIMEOUT_MS", 3000),
  };
}
export type Config = ReturnType<typeof readConfig>;
