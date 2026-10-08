// "Spielmodus": real grades fixed, assumed grades for the open CP, resulting average.
import { useMemo, useState } from "react";
import { erreichteLeistungen, formatCp, formatNote, kategorieVon, parseNote } from "../logic/noten";
import { ausPlan, neueId, offeneCpAuffuellen, spielErgebnis } from "../logic/spiel";
import { bestaetigen } from "../platform";
import { useStore } from "../store";
import type { SpielZeile } from "../types";
import { ERREICHT } from "../types";
import { KategorieBadge } from "./ui";

export function Spielmodus() {
  const { belegungen, regeln, spiel, setSpiel } = useStore();
  const [markiert, setMarkiert] = useState<Set<string>>(new Set());
  const [massNote, setMassNote] = useState("1,3");
  const [echteOffen, setEchteOffen] = useState(false);

  const echte = useMemo(() => belegungen.filter((b) => ERREICHT.includes(b.status)), [belegungen]);
  const r = useMemo(() => spielErgebnis(belegungen, spiel, regeln), [belegungen, spiel, regeln]);
  const notenOptionen = regeln.notenstufen.map((n) => Math.round(n * 100));

  const update = (id: string, patch: Partial<SpielZeile>) => void setSpiel(spiel.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const toggle = (id: string) =>
    setMarkiert((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const massNote100 = parseNote(massNote);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Was wäre, wenn …</div>
          <h1>Spielmodus</h1>
          <p className="lead">
            Deine echten Noten bleiben fest. Für die offenen CP trägst du vermutete Noten ein und siehst den Schnitt, der dabei herauskommt. Nichts hier verändert deine echten Daten.
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="eyebrow">Zeugnisnote (Spiel)</span>
          <span className="big">{r.zeugnis10 == null ? "–" : formatNote(r.zeugnis10 * 10)}</span>
          <span className="sub">
            {r.praedikat ?? "–"}
            {r.auszeichnung ? " · mit Auszeichnung" : ""}
          </span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Exakter Schnitt</span>
          <span className="mid">{formatNote(r.exakt100, 2)}</span>
          <span className="sub">abgeschnitten</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">CP-Abdeckung</span>
          <span className="mid">
            {formatCp(r.gesamtCp)} <span className="faint small">/ {formatCp(regeln.gesamtCp)}</span>
          </span>
          <span className="sub">
            {formatCp(r.echteCp)} echt · {formatCp(r.hypothetischeCp)} angenommen
          </span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Ohne Note</span>
          <span className="mid">{r.ohneNote}</span>
          <span className="sub">{r.ohneNote ? "Zeilen zählen noch nicht in den Schnitt" : "alle Zeilen haben eine Note"}</span>
        </div>
      </div>

      <div className="card stack">
        <div className="row">
          <button onClick={() => void setSpiel([...spiel, ...ausPlan(belegungen, spiel)])}>Aus Plan übernehmen</button>
          <button onClick={() => void setSpiel([...spiel, ...offeneCpAuffuellen(erreichteLeistungen(belegungen), spiel, regeln)])}>Offene CP auffüllen</button>
          <button
            onClick={() =>
              void setSpiel([...spiel, { id: neueId(), titel: "Neue Zeile", kategorie: regeln.kategorien[0]?.id ?? "K", cp: 5, note100: null, quelle: "manuell" }])
            }
          >
            + Zeile
          </button>
          <span className="spacer" />
          <span className="small muted">Markierte auf</span>
          <input className="note-input" value={massNote} onChange={(e) => setMassNote(e.target.value)} aria-label="Note für markierte Zeilen" aria-invalid={massNote100 == null} />
          <button
            disabled={!markiert.size || massNote100 == null}
            onClick={() => {
              void setSpiel(spiel.map((z) => (markiert.has(z.id) && kategorieVon(regeln, z.kategorie)?.zaehltZurNote ? { ...z, note100: massNote100 } : z)));
            }}
          >
            setzen
          </button>
          <button
            className="danger"
            disabled={!spiel.length}
            onClick={async () => {
              if (await bestaetigen("Alle Spielzeilen löschen? Deine echten Noten bleiben unberührt.")) {
                setMarkiert(new Set());
                await setSpiel([]);
              }
            }}
          >
            Zurücksetzen
          </button>
        </div>
      </div>

      <div className="card flat">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="c" style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Alle markieren"
                    checked={spiel.length > 0 && markiert.size === spiel.length}
                    onChange={(e) => setMarkiert(e.target.checked ? new Set(spiel.map((z) => z.id)) : new Set())}
                  />
                </th>
                <th>Modul</th>
                <th>Kategorie</th>
                <th className="r">CP</th>
                <th className="c">Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr className="group clickable" onClick={() => setEchteOffen((x) => !x)}>
                <td className="c">{echteOffen ? "▾" : "▸"}</td>
                <td colSpan={2}>Echte Noten ({echte.length}) – fest</td>
                <td className="num">{formatCp(r.echteCp)}</td>
                <td colSpan={2} />
              </tr>
              {echteOffen
                ? echte.map((b) => (
                    <tr key={`b${b.id}`} className="fixed">
                      <td />
                      <td>{b.titel}</td>
                      <td>
                        <KategorieBadge id={b.kategorie} unterbereich={b.unterbereich} />
                      </td>
                      <td className="num">{formatCp(b.cp)}</td>
                      <td className="c mono">{b.note100 == null ? "best." : formatNote(b.note100)}</td>
                      <td />
                    </tr>
                  ))
                : null}
              <tr className="group">
                <td />
                <td colSpan={2}>Angenommen ({spiel.length})</td>
                <td className="num">{formatCp(r.hypothetischeCp)}</td>
                <td colSpan={2} />
              </tr>
              {spiel.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Noch keine Spielzeilen. „Aus Plan übernehmen“ holt deine geplanten Module, „Offene CP auffüllen“ ergänzt Platzhalter bis 120 CP.
                  </td>
                </tr>
              ) : (
                spiel.map((z) => {
                  const kat = kategorieVon(regeln, z.kategorie);
                  const benotbar = kat?.zaehltZurNote ?? true;
                  return (
                    <tr key={z.id}>
                      <td className="c">
                        <input type="checkbox" checked={markiert.has(z.id)} onChange={() => toggle(z.id)} aria-label={`${z.titel} markieren`} />
                      </td>
                      <td>
                        <input value={z.titel} onChange={(e) => update(z.id, { titel: e.target.value })} style={{ width: "100%" }} aria-label="Titel" />
                        <div className="small faint">{z.quelle === "plan" ? "aus dem Plan" : z.quelle === "platzhalter" ? "Platzhalter" : "eigene Zeile"}</div>
                      </td>
                      <td>
                        <select value={z.kategorie} onChange={(e) => update(z.id, { kategorie: e.target.value })} aria-label="Kategorie">
                          {regeln.kategorien.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.kurz}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="r">
                        <input className="cp-input" type="number" min={0.5} step={0.5} value={z.cp} onChange={(e) => update(z.id, { cp: Number(e.target.value) || 0 })} aria-label="CP" />
                      </td>
                      <td className="c">
                        {benotbar ? (
                          <select
                            value={z.note100 ?? ""}
                            onChange={(e) => update(z.id, { note100: e.target.value ? Number(e.target.value) : null })}
                            aria-label="Vermutete Note"
                            className="mono"
                          >
                            <option value="">–</option>
                            {notenOptionen.map((n) => (
                              <option key={n} value={n}>
                                {formatNote(n)}
                              </option>
                            ))}
                            {z.note100 != null && !notenOptionen.includes(z.note100) ? <option value={z.note100}>{formatNote(z.note100)}</option> : null}
                          </select>
                        ) : (
                          <span className="small faint">unbenotet</span>
                        )}
                      </td>
                      <td className="r">
                        <button className="ghost icon" onClick={() => void setSpiel(spiel.filter((x) => x.id !== z.id))} aria-label="Zeile löschen">
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
