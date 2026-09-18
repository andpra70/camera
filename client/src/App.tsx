import { useEffect, useState } from "react";
import { useCameras } from "./hooks/useCameras";
import { useStream } from "./hooks/useStream";
import { CameraList } from "./components/CameraList";
import { Viewer } from "./components/Viewer";
import { CameraSettings } from "./components/CameraSettings";
export function App() {
  const { inventory, loading, error, refresh } = useCameras();
  const [selected, setSelected] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const camera = inventory.cameras.find((c) => c.id === selected);
  const stream = useStream(camera);
  useEffect(() => {
    if (camera) setSelectedName(camera.label);
  }, [camera]);
  const disabled =
    !camera ||
    camera.availability === "permission_denied" ||
    camera.availability === "unsupported";
  return (
    <div className="shell">
      <header className="header">
        <a
          className="brand"
          href="./"
          aria-label="Camera Viewer, pagina iniziale"
        >
          <span className="brand-icon">◉</span>
          <span>
            Camera<span className="brand-light"> Viewer</span>
          </span>
        </a>
        <span className="host-label">
          <i /> UBUNTU HOST
        </span>
      </header>
      <main>
        <div className="intro">
          <span className="eyebrow">IL TUO PUNTO DI VISTA</span>
          <h1>
            Le tue camere.
            <br />
            <span>In diretta, qui.</span>
          </h1>
          <p>Esplora le camere collegate al server e scegli cosa vedere.</p>
        </div>
        <div className="workspace">
          <aside className="devices">
            <div className="section-heading">
              <h2>
                Dispositivi <span>{inventory.cameras.length}</span>
              </h2>
              <button
                className="refresh"
                onClick={() => void refresh(true)}
                disabled={loading}
                aria-label="Aggiorna elenco camere"
              >
                ↻ <span>Aggiorna</span>
              </button>
            </div>
            {loading && !inventory.scannedAt ? (
              <p className="empty-note" role="status">
                Ricerca delle camere…
              </p>
            ) : inventory.cameras.length ? (
              <CameraList
                cameras={inventory.cameras}
                selected={selected}
                onSelect={(id) => {
                  setSelected(id);
                }}
              />
            ) : (
              <div className="empty-note">
                <strong>Nessuna camera disponibile</strong>
                <p>
                  Collega una camera al server Ubuntu e rendi accessibile il
                  dispositivo nel container, poi aggiorna l’elenco.
                </p>
              </div>
            )}
            <div className="device-note">
              <span>ⓘ</span>
              <p>
                Le immagini provengono dalle camere del server. La webcam di
                questo browser non viene utilizzata.
              </p>
            </div>
          </aside>
          <div className="preview-column">
            <div className="camera-main">
              <Viewer
                camera={camera}
                source={stream.source}
                phase={stream.phase}
                status={stream.status}
                onError={stream.imageError}
              />
              <div className="controls">
                <span className="selection-label">
                  {camera
                    ? `Selezionata: ${camera.label}`
                    : selectedName
                      ? `${selectedName} non disponibile`
                      : "Scegli un dispositivo dall’elenco"}
                </span>
                {stream.active ? (
                  <button className="primary stop" onClick={stream.stop}>
                    ■ Ferma
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={disabled}
                    onClick={stream.start}
                  >
                    ▶ {stream.error ? "Riprova" : "Avvia"}
                  </button>
                )}
              </div>
              {(error ||
                stream.error ||
                inventory.stale ||
                camera?.lastError) && (
                <div className="error" role="alert">
                  {stream.error ||
                    error ||
                    camera?.lastError?.message ||
                    inventory.diagnostics.join(" ")}
                </div>
              )}
            </div>
            <CameraSettings
              camera={camera}
              streamActive={stream.active}
              onUpdated={() => refresh()}
            />
          </div>
        </div>
      </main>
      <footer>
        <span>UBUNTU CAMERA VIEWER</span>
        <span>Solo immagini live · Nessuna registrazione</span>
      </footer>
    </div>
  );
}
