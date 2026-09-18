import { useEffect, useState } from "react";
import type { Camera, CameraControl } from "../../../shared/src/models/camera";
import {
  cameraControls,
  updateCameraControl,
  updateCameraProfile,
} from "../services/api";

export function CameraSettings({
  camera,
  streamActive,
  onUpdated,
}: {
  camera?: Camera;
  streamActive: boolean;
  onUpdated: () => Promise<unknown>;
}) {
  const [controls, setControls] = useState<CameraControl[]>([]);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [profileId, setProfileId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setControls([]);
    setDraft({});
    setError("");
    setProfileId(camera?.selectedProfile?.id || "");
    if (!camera) return () => controller.abort();
    setLoading(true);
    void cameraControls(camera.id, controller.signal)
      .then(({ controls: found }) => {
        setControls(found);
        setDraft(
          Object.fromEntries(
            found.map((control) => [control.name, control.value]),
          ),
        );
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Impostazioni non disponibili",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [camera?.id]);

  const changed = controls.filter(
    (control) => draft[control.name] !== control.value,
  );
  const profileChanged = profileId !== (camera?.selectedProfile?.id || "");
  const save = async () => {
    if (!camera || (!changed.length && !profileChanged)) return;
    const controller = new AbortController();
    setSaving(true);
    setError("");
    try {
      if (profileChanged)
        await updateCameraProfile(camera.id, profileId, controller.signal);
      let latest = controls;
      for (const control of changed)
        latest = (
          await updateCameraControl(
            camera.id,
            control.name,
            draft[control.name],
            controller.signal,
          )
        ).controls;
      setControls(latest);
      setDraft(
        Object.fromEntries(
          latest.map((control) => [control.name, control.value]),
        ),
      );
      await onUpdated();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Impostazione non applicata",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!camera) return null;
  return (
    <section className="settings" aria-label="Impostazioni camera">
      <div className="settings-heading">
        <div>
          <span className="eyebrow">REGOLAZIONI</span>
          <h2>Impostazioni camera</h2>
        </div>
        <button
          className="primary"
          disabled={saving || (!changed.length && !profileChanged)}
          onClick={() => void save()}
        >
          {saving ? "Salvataggio…" : "Applica"}
        </button>
      </div>
      <label className="setting definition-setting">
        <span>Definizione e formato</span>
        <select
          value={profileId}
          disabled={streamActive}
          onChange={(event) => setProfileId(event.target.value)}
        >
          {camera.profiles.map((profile) => (
            <option value={profile.id} key={profile.id}>
              {profile.output.width} × {profile.output.height} ·{" "}
              {Math.round(profile.output.fps)} fps ·{" "}
              {profile.inputFormat.toUpperCase()}
            </option>
          ))}
        </select>
        {streamActive && (
          <small>Ferma la visualizzazione per cambiare definizione.</small>
        )}
      </label>
      {loading ? (
        <p className="settings-note">Lettura impostazioni…</p>
      ) : controls.length ? (
        <div className="settings-grid">
          {controls.map((control) => (
            <label className="setting" key={control.name}>
              <span>{control.label}</span>
              {control.type === "boolean" ? (
                <select
                  value={draft[control.name] ?? control.value}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [control.name]: Number(event.target.value),
                    })
                  }
                >
                  <option value={1}>Attivo</option>
                  <option value={0}>Disattivo</option>
                </select>
              ) : control.type === "menu" ? (
                <select
                  value={draft[control.name] ?? control.value}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [control.name]: Number(event.target.value),
                    })
                  }
                >
                  {control.options?.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="range-control">
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={draft[control.name] ?? control.value}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [control.name]: Number(event.target.value),
                      })
                    }
                  />
                  <output>{draft[control.name] ?? control.value}</output>
                </div>
              )}
            </label>
          ))}
        </div>
      ) : (
        <p className="settings-note">
          Nessuna impostazione regolabile disponibile.
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
