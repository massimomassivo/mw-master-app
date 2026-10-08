// "Noten": real grades, average, certificate grade, structure check, deadlines.
import { useMemo, useState } from "react";
import { berechneSchnitt, erreichteLeistungen, formatCp, formatNote, fristenCheck, istNotenstufe, strukturCheck } from "../logic/noten";
import { compareSemester, VOR_MASTER } from "../logic/semester";
import { useStore } from "../store";
import type { Belegung } from "../types";
import { ERREICHT } from "../types";
import { BelegungDialog, leereBelegung } from "./BelegungDialog";
import { StrukturListe } from "./Struktur";
import { KategorieBadge, StatusPill } from "./ui";

export function Noten() {
  const { belegungen, regeln, settings } = useStore();
  const [edit, setEdit] = useState<Belegung | null>(null);

  const erreicht = useMemo(() => belegungen.filter((b) => ERREICHT.includes(b.status)), [belegungen]);
  const leistungen = useMemo(() => erreichteLeistungen(belegungen), [belegungen]);
  const s = useMemo(() => berechneSchnitt(leistungen, regeln), [leistungen, regeln]);
  const check = useMemo(() => strukturCheck(leistungen, regeln), [leistungen, regeln]);
  const fristen = useMemo(() => fristenCheck(belegungen, regeln, settings.erstesSemester, new Date()), [belegungen, regeln, settings.erstesSemester]);
  const nichtBestanden = belegungen.filter((b) => b.status === "nicht_bestanden");

  const gruppiert = regeln.kategorien
    .map((k) => ({ k, items: erreicht.filter((b) => b.kategorie === k.id).sort((a, b) => compareSemester(a.semester, b.semester)) }))
    .filter((g) => g.items.length);
  const unbekannt = erreicht.filter((b) => !regeln.kategorien.some((k) => k.id === b.kategorie));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Meine Noten</div>
          <h1>Noten und Schnitt</h1>
          <p className="lead">Gewichtet nach CP, im Zeugnis nach der ersten Nachkommastelle abgeschnitten. Die Überfachliche Ergänzung zählt nur für die CP.</p>
        </div>
        <button className="primary" onClick={() => setEdit(leereBelegung({ status: "bestanden", semester: settings.erstesSemester }))}>
          + Note eintragen
        </button>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="eyebrow">Zeugnisnote</span>
          <span className="big">{s.zeugnis10 == null ? "–" : formatNote(s.zeugnis10 * 10)}</span>
          <span className="sub">
            {s.praedikat ?? "noch keine benotete Leistung"}
            {s.auszeichnung ? " · mit Auszeichnung" : ""}
          </span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Exakter Schnitt</span>
          <span className="mid">{formatNote(s.exakt100, 2)}</span>
          <span className="sub">abgeschnitten, nicht gerundet</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Credits</span>
          <span className="mid">
            {formatCp(s.gesamtCp)} <span className="faint small">/ {formatCp(regeln.gesamtCp)}</span>
          </span>
          <div className="meter">
            <span style={{ width: `${Math.min(100, (s.gesamtCp / regeln.gesamtCp) * 100)}%` }} />
          </div>
        </div>
        <div className="kpi">
          <span className="eyebrow">Davon benotet</span>
          <span className="mid">{formatCp(s.benoteteCp)} CP</span>
          <span className="sub">{formatCp(s.unbenoteteCp)} CP ohne Note</span>
        </div>
      </div>

      {fristen
        .filter((f) => !f.erfuellt)
        .map((f) => (
          <div key={f.frist.text} className={`notice ${f.dringend ? "warn" : ""}`}>
            <span>⏱</span>
            <span>
              <strong>{f.dringend ? "Frist läuft ab: " : "Frist: "}</strong>
              {f.frist.text}
              {f.aktuellesFachsemester != null ? ` – du bist im ${f.aktuellesFachsemester}. Fachsemester.` : ""}
            </span>
          </div>
        ))}

      <div className="catalog with-detail" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 1fr)" }}>
        <div className="card flat">
          {erreicht.length === 0 ? (
            <div className="empty">
              Noch keine Noten. Trag die erste mit „+ Note eintragen“ ein – oder importiere deine bisherigen Noten unter Einstellungen → Daten.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Modul</th>
                    <th>Semester</th>
                    <th className="r">CP</th>
                    <th className="c">Note</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...gruppiert, ...(unbekannt.length ? [{ k: { id: "?", name: "Unbekannte Kategorie" }, items: unbekannt }] : [])].map(({ k, items }) => (
                    <GroupRows key={k.id} kid={k.id} name={k.name} items={items} onEdit={setEdit} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nichtBestanden.length ? (
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)" }} className="small muted">
              Nicht bestanden (zählt nicht): {nichtBestanden.map((b) => b.titel).join(", ")}
            </div>
          ) : null}
        </div>
        <div className="card">
          <StrukturListe check={check} titel="Strukturcheck" />
        </div>
      </div>

      {edit ? <BelegungDialog start={edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function GroupRows({ kid, name, items, onEdit }: { kid: string; name: string; items: Belegung[]; onEdit: (b: Belegung) => void }) {
  const { regeln } = useStore();
  const cp = items.reduce((a, b) => a + b.cp, 0);
  return (
    <>
      <tr className="group">
        <td colSpan={2}>
          <KategorieBadge id={kid} /> <span className="muted" style={{ fontWeight: 400 }}>{name}</span>
        </td>
        <td className="num">{formatCp(cp)}</td>
        <td colSpan={2} />
      </tr>
      {items.map((b) => (
        <tr key={b.id} className="clickable" onClick={() => onEdit(b)}>
          <td>
            <div>{b.titel}</div>
            <div className="small faint mono">
              {b.modulCode ?? "freier Eintrag"}
              {b.unterbereich ? ` · ${b.unterbereich === "UE-ETHIK" ? "Ethik" : "Weitere Angebote"}` : ""}
            </div>
          </td>
          <td className="small">{b.semester === VOR_MASTER ? "vor dem Master" : b.semester}</td>
          <td className="num">{formatCp(b.cp)}</td>
          <td className="c mono" title={b.note100 != null && !istNotenstufe(b.note100, regeln) ? "umgerechnete Note" : undefined}>
            {b.note100 == null ? <span className="faint">best.</span> : formatNote(b.note100)}
          </td>
          <td>
            <StatusPill status={b.status} />
          </td>
        </tr>
      ))}
    </>
  );
}
