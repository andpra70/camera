import express from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "./config/index.js";
import { CameraRegistry } from "./cameras/registry.js";
import { StreamManager } from "./capture/manager.js";
import { serveImages } from "./capture/http.js";
import { V4LCameraControls, type CameraControls } from "./cameras/controls.js";
import { AppError } from "./errors.js";
import { log } from "./log.js";
export interface AppDependencies {
  config: Config;
  registry: CameraRegistry;
  manager: StreamManager;
  ready: () => Promise<boolean>;
  clientDir?: string;
  controls?: CameraControls;
}
export function createApp({
  config,
  registry,
  manager,
  ready,
  clientDir = resolve("client/dist"),
  controls = new V4LCameraControls(),
}: AppDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxyHops || false);
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.set("X-Request-Id", res.locals.requestId);
    res
      .set("X-Content-Type-Options", "nosniff")
      .set("Referrer-Policy", "same-origin");
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    res.on("finish", () =>
      log("debug", "http_request", {
        requestId: res.locals.requestId,
        method: req.method,
        status: res.statusCode,
      }),
    );
    next();
  });
  const router = express.Router();
  router.use(express.json({ limit: "4kb" }));
  router.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  router.get("/api/ready", async (_req, res) => {
    const ok = existsSync(resolve(clientDir, "index.html")) && (await ready());
    res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "not_ready" });
  });
  router.get("/api/cameras", (_req, res) => {
    res.json(registry.list());
  });
  let lastRefresh = 0;
  router.post("/api/cameras/refresh", async (req, res) => {
    const origin = req.get("origin");
    const expected = `${req.protocol}://${req.get("host")}`;
    if (
      (origin && origin !== expected) ||
      req.get("sec-fetch-site") === "cross-site"
    )
      throw new AppError(
        "INVALID_REQUEST",
        "Origine della richiesta non consentita.",
        400,
      );
    if (Date.now() - lastRefresh < 1000)
      throw new AppError(
        "STREAM_LIMIT_REACHED",
        "Attendere prima di aggiornare nuovamente.",
        429,
        true,
      );
    lastRefresh = Date.now();
    res.json(await registry.refresh());
  });
  router.get("/api/cameras/:id", (req, res) => {
    res.json({
      ...registry.get(req.params.id),
      readers: manager.readers(req.params.id),
    });
  });
  router.get("/api/cameras/:id/controls", async (req, res) => {
    res.json(await controls.list(registry.get(req.params.id)));
  });
  router.put("/api/cameras/:id/profile", (req, res) => {
    const origin = req.get("origin");
    const expected = `${req.protocol}://${req.get("host")}`;
    if (
      !origin ||
      origin !== expected ||
      req.get("sec-fetch-site") === "cross-site"
    )
      throw new AppError(
        "INVALID_REQUEST",
        "Origine della richiesta non consentita.",
        400,
      );
    const camera = registry.selectProfile(req.params.id, req.body?.profileId);
    res.json({ ...camera, readers: manager.readers(camera.id) });
  });
  router.put("/api/cameras/:id/controls/:name", async (req, res) => {
    const origin = req.get("origin");
    const expected = `${req.protocol}://${req.get("host")}`;
    if (
      !origin ||
      origin !== expected ||
      req.get("sec-fetch-site") === "cross-site"
    )
      throw new AppError(
        "INVALID_REQUEST",
        "Origine della richiesta non consentita.",
        400,
      );
    res.json(
      await controls.set(
        registry.get(req.params.id),
        req.params.name,
        req.body?.value,
      ),
    );
  });
  for (const action of ["stream", "snapshot"])
    router.get(`/api/cameras/:id/${action}`, (req, res, next) => {
      serveImages(
        manager,
        registry.get(req.params.id as string),
        action === "snapshot",
        config.startTimeout,
        req,
        res,
        next,
      );
    });
  router.use("/api", (_req, _res, next) =>
    next(new AppError("INVALID_REQUEST", "Endpoint API non trovato.", 404)),
  );
  router.use(
    "/assets",
    express.static(resolve(clientDir, "assets"), {
      immutable: true,
      maxAge: "1y",
      index: false,
    }),
  );
  router.use(
    express.static(clientDir, {
      maxAge: 0,
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  if (config.basePath !== "/")
    app.use((req, res, next) => {
      if (req.path === config.basePath.slice(0, -1)) {
        res.redirect(
          308,
          config.basePath +
            (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""),
        );
        return;
      }
      next();
    });
  app.use(config.basePath, router);
  app.use((_req, res) => {
    res.status(404).type("text").send("Risorsa non trovata");
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const err =
        error instanceof AppError
          ? error
          : new AppError("INTERNAL_ERROR", "Errore interno del server.", 500);
      log("warn", "http_error", {
        requestId: res.locals.requestId,
        code: err.code,
      });
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res
        .status(err.status)
        .json({ error: err.publicData(), requestId: res.locals.requestId });
    },
  );
  return app;
}
