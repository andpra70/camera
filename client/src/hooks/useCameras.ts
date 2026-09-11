import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraListResponse } from "../../../shared/src/models/camera";
import { listCameras } from "../services/api";
export function useCameras() {
  const [inventory, setInventory] = useState<CameraListResponse>({
    cameras: [],
    scannedAt: null,
    stale: false,
    diagnostics: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async (force = false) => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    if (force) setLoading(true);
    try {
      const data = await listCameras(active.signal, force);
      if (!active.signal.aborted) {
        setInventory(data);
        setError("");
      }
    } catch (e) {
      if (!active.signal.aborted)
        setError(e instanceof Error ? e.message : "Errore di connessione");
    } finally {
      if (!active.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
    };
  }, [refresh]);
  return { inventory, loading, error, refresh };
}
