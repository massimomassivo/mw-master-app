// First start: first semester, shared folder (optional), backup folder (optional).
import { useState } from "react";
import { isTauri } from "../api";
import { pickFolder } from "../platform";
import { useStore } from "../store";
import { semesterAuswahl, SharedStatus } from "./Einstellungen";

export function Einrichtung() {
  const { settings, setSettings, leseShared, einlesen } = useStore();
  const [schritt, setSchritt] = useState(0);

  async function waehleShared() {
    const p = await pickFolder("Geteilten Ordner wählen (shared oder der Ordner darüber)");
    if (!p) return;
    await setSettings({ sharedPath: p });
    await leseShared({ pfad: p });
  }

  async function waehleBackup() {
    const p = await pickFolder("Ordner für Backups wählen");
    if (p) await setSettings({ backupDir: p });
  }

  const steps = (
    <div className="steps" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i <= schritt ? "on" : ""} />
      ))}
    </div>
  );

  return (
    <div className="setup">
      <div className="card">
        {steps}
        {schritt === 0 ? (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <div className="eyebrow">Willkommen bei MW Master</div>
              <h1>In welchem Semester hast du den Master begonnen?</h1>
              <p className="muted">Daraus ergeben sich die Spalten im Semesterplan und die Fachsemester für Fristen.</p>
            </div>
            <select value={settings.erstesSemester} onChange={(e) => void setSettings({ erstesSemester: e.target.value })} style={{ maxWidth: 220 }}>
              {semesterAuswahl().map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="row">
              <span className="spacer" />
              <button className="primary" onClick={() => setSchritt(1)}>
                Weiter
              </button>
            </div>
          </>
        ) : null}
        {schritt === 1 ? (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <h1>Geteilten Ordner verknüpfen</h1>
              <p className="muted">
                Darin liegen Modulkatalog und Notenspiegel. Entweder der eingebundene OneDrive-Ordner oder ein entpackter ZIP-Download. Das geht auch später unter Einstellungen.
              </p>
              {!isTauri ? <p className="small faint">Browser-Modus: „beispieldaten“ eingeben, um die erfundenen Beispieldaten zu laden.</p> : null}
            </div>
            <div className="row">
              <button onClick={waehleShared} disabled={einlesen.laeuft}>
                Ordner wählen
              </button>
              <code className="mono small muted">{settings.sharedPath ?? ""}</code>
            </div>
            <SharedStatus />
            <div className="row">
              <button className="ghost" onClick={() => setSchritt(0)}>
                Zurück
              </button>
              <span className="spacer" />
              <button className="primary" onClick={() => setSchritt(2)}>
                {settings.sharedPath ? "Weiter" : "Überspringen"}
              </button>
            </div>
          </>
        ) : null}
        {schritt === 2 ? (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <h1>Backup-Ordner (optional)</h1>
              <p className="muted">
                Deine Noten und dein Plan bleiben auf diesem Rechner. Mit einem Backup-Ordner – z. B. einem privaten OneDrive-Ordner – wird nach jeder Änderung automatisch eine Sicherung geschrieben. Nicht den geteilten Ordner nehmen.
              </p>
            </div>
            <div className="row">
              <button onClick={waehleBackup}>Ordner wählen</button>
              <code className="mono small muted">{settings.backupDir ?? ""}</code>
            </div>
            <div className="row">
              <button className="ghost" onClick={() => setSchritt(1)}>
                Zurück
              </button>
              <span className="spacer" />
              <button className="primary" onClick={() => void setSettings({ einrichtungFertig: true })}>
                Fertig
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
