import type { Camera } from "../../../shared/src/models/camera";
const availability: Record<Camera["availability"], string> = {
  unknown: "Da verificare",
  available: "Disponibile",
  permission_denied: "Permessi insufficienti",
  unsupported: "Formato non supportato",
  disconnected: "Scollegata",
  busy: "Occupata",
};
export function CameraList({
  cameras,
  selected,
  onSelect,
}: {
  cameras: Camera[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="camera-list" aria-label="Camere del server">
      {cameras.map((camera, index) => (
        <button
          className={`camera-card ${selected === camera.id ? "selected" : ""}`}
          key={camera.id}
          aria-pressed={selected === camera.id}
          onClick={() => onSelect(camera.id)}
        >
          <span className="camera-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="camera-details">
            <strong>{camera.label}</strong>
            <small>
              {camera.deviceName}
              {camera.physicalGroupId
                ? ` · gruppo ${camera.physicalGroupId.slice(0, 4)}`
                : ""}
            </small>
            <span className="availability">
              <i
                className={camera.availability === "available" ? "green" : ""}
              />
              {availability[camera.availability]}
            </span>
          </span>
          <span className="selection-mark">
            {selected === camera.id ? "●" : "○"}
          </span>
        </button>
      ))}
    </div>
  );
}
