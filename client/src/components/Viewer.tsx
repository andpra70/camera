import type {
  Camera,
  CameraStatusResponse,
} from "../../../shared/src/models/camera";
export function Viewer({
  camera,
  source,
  phase,
  status,
  onError,
}: {
  camera?: Camera;
  source?: string;
  phase: string;
  status?: CameraStatusResponse;
  onError: () => void;
}) {
  const profile = status?.selectedProfile || camera?.selectedProfile;
  return (
    <section className="viewer" aria-label="Visualizzazione camera">
      <div className="viewer-top">
        <span className="eyebrow">ANTEPRIMA</span>
        <span className={`live-badge ${phase === "Live" ? "is-live" : ""}`}>
          <i />
          {phase}
        </span>
      </div>
      <div className="image-stage">
        {source ? (
          <img
            key={source}
            src={source}
            alt={`Immagini in diretta da ${camera?.label}`}
            onError={onError}
          />
        ) : (
          <div className="placeholder">
            <div className="lens">
              <span />
            </div>
            <h2>
              {camera ? "La tua camera è pronta" : "Uno sguardo dal server"}
            </h2>
            <p>
              {camera
                ? "Premi Avvia per vedere le immagini in diretta."
                : "Seleziona una camera disponibile per iniziare."}
            </p>
          </div>
        )}
      </div>
      <div className="viewer-footer">
        <span>{camera?.label || "Nessuna camera selezionata"}</span>
        <span>
          {profile
            ? `${profile.output.width} × ${profile.output.height} · ${Math.round(profile.output.fps)} fps`
            : "—"}
        </span>
      </div>
      {status?.lastFrameAt && (
        <p className="frame-time">
          Ultimo fotogramma:{" "}
          {new Date(status.lastFrameAt).toLocaleTimeString("it-IT")}
        </p>
      )}
    </section>
  );
}
