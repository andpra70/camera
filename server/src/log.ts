const levels = ["debug", "info", "warn", "error"];
export function log(
  level: string,
  event: string,
  data: Record<string, unknown> = {},
) {
  if (levels.indexOf(level) >= levels.indexOf(process.env.LOG_LEVEL || "info"))
    console.log(
      JSON.stringify({ time: new Date().toISOString(), level, event, ...data }),
    );
}
