import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Camera,
  CameraStatusResponse,
} from "../../../shared/src/models/camera";
import { apiUrl, cameraStatus, RequestError } from "../services/api";
export function useStream(camera: Camera | undefined) {
  const [active, setActive] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState<string>();
  const [status, setStatus] = useState<CameraStatusResponse>();
  const [phase, setPhase] = useState("Pronta");
  const [error, setError] = useState("");
  const failed = useRef<() => void>(() => {});
  const attempts = useRef(0);
  const previousId = useRef<string | undefined>(undefined);
  const stop = useCallback(() => {
    setActive(false);
    setSource(undefined);
    setPhase("Visualizzazione fermata");
    setError("");
  }, []);
  const start = useCallback(() => {
    attempts.current = 0;
    setError("");
    setAttempt((n) => n + 1);
    setActive(true);
  }, []);
  const id = camera?.id;
  useEffect(() => {
    if (previousId.current !== id) {
      attempts.current = 0;
      previousId.current = id;
      setError("");
    }
    setSource(undefined);
    setStatus(undefined);
    if (!active || !id) {
      if (active && !id) {
        setActive(false);
        setError("La camera selezionata è stata scollegata.");
        setPhase("Dispositivo scollegato");
      }
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let retryTimer: ReturnType<typeof setTimeout>;
    let failing = false;
    const started = Date.now();
    setPhase("Connessione");
    setSource(
      apiUrl(
        `cameras/${encodeURIComponent(id)}/stream?attempt=${attempt}-${Date.now()}`,
      ),
    );
    const failure = (message: string, retryable: boolean) => {
      if (failing || controller.signal.aborted) return;
      failing = true;
      clearTimeout(timer);
      setSource(undefined);
      setError(message);
      if (retryable && attempts.current < 3) {
        const delay = 1000 * 2 ** attempts.current++;
        setPhase(`Nuovo tentativo tra ${delay / 1000} s`);
        retryTimer = setTimeout(() => setAttempt((n) => n + 1), delay);
      } else {
        setPhase("Errore");
        setActive(false);
      }
    };
    const check = async (imageFailed = false) => {
      try {
        const result = await cameraStatus(id, controller.signal);
        if (controller.signal.aborted || failing) return;
        setStatus(result);
        if (result.captureState === "error" || result.lastError) {
          failure(
            result.lastError?.message || "Camera non disponibile.",
            result.lastError?.retryable ?? true,
          );
          return;
        }
        if (imageFailed) {
          failure("Il collegamento video si è interrotto.", true);
          return;
        }
        if (
          result.captureState === "streaming" &&
          result.lastFrameAt &&
          Date.now() - Date.parse(result.lastFrameAt) < 10000
        ) {
          setPhase("Live");
          setError("");
        } else if (Date.now() - started > 12000) {
          failure("Nessuna immagine ricevuta dalla camera.", true);
          return;
        }
      } catch (e) {
        if (!controller.signal.aborted)
          failure(
            e instanceof Error ? e.message : "Connessione interrotta.",
            e instanceof RequestError ? e.retryable : true,
          );
      }
      if (!controller.signal.aborted && !failing)
        timer = setTimeout(() => void check(), 2000);
    };
    timer = setTimeout(() => void check(), 500);
    failed.current = () => {
      clearTimeout(timer);
      void check(true);
    };
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(retryTimer);
      failed.current = () => {};
    };
  }, [active, id, attempt]);
  return {
    active,
    source,
    phase,
    error,
    status,
    start,
    stop,
    imageError: () => failed.current(),
  };
}
