// "Spielmodus": real grades fixed, assumed grades for the open CP, resulting average.
// Laid out as one colour-coded card per category in several columns, so all
// grades fit on one screen; a compact structure check sits on top.
import { useMemo, useState } from "react";
import { erreichteLeistungen, formatCp, formatNote, kategorieVon, parseNote, strukturCheck, type BereichCheck, type CheckStatus } from "../logic/noten";
import { alsLeistungen, ausPlan, neueId, offeneCpAuffuellen, spielErgebnis } from "../logic/spiel";
import { bestaetigen } from "../platform";
import { useStore } from "../store";
import type { Belegung, Kategorie, SpielZeile } from "../types";
import { ERREICHT } from "../types";
import { kategorieFarbe } from "./ui";

const STATUS_PILL: Record<CheckStatus, { text: string; cls: string }> = {
  ok: { text: "OK", cls: "ok" },
  offen: { text: "offen", cls: "" },
  frei: { text: "", cls: "" },
  ueber: { text: "über Max.", cls: "bad" },
};

export function Spielmodus() {
  const { belegungen, regeln, spiel, setSpiel } = useStore();
  const [markiert, setMarkiert] = useState<Set<string>>(new Set());
  const [massNote, setMassNote] = useState("1,3");
  const [echteZeigen, setEchteZeigen] = useState(true);

  const echte = useMemo(() => belegungen.filter((b) => ERREICHT.includes(b.status)), [belegungen]);
  const r = useMemo(() => spielErgebnis(belegungen, spiel, regeln), [belegungen, spiel, regeln]);
  const check = useMemo(() => strukturCheck([...erreichteLeistungen(belegungen), ...alsLeistungen(spiel)], regeln), [belegungen, spiel, regeln]);
  const notenOptionen = regeln.notenstufen.map((n) => Math.round(n * 100));

  // CP per category, split into real and assumed (for the stacked bars).
  const cpJe = useMemo(() => {
    const m = new Map<string, { echt: number; spiel: number }>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { echt: 0, spiel: 0 }), m.get(k)!);
    for (const b of echte) get(b.kategorie).echt += b.cp;
    for (const z of spiel) get(z.kategorie).spiel += z.cp;
    return m;
  }, [echte, spiel]);

  const update = (id: string, patch: Partial<SpielZeile>) => void setSpiel(spiel.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const toggle = (id: string) =>
    setMarkiert((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const neueZeile = (kategorie: string) => void setSpiel([...spiel, { id: neueId(), titel: "Neue Zeile", kategorie, cp: 5, note100: null, quelle: "manuell" }]);

  const massNote100 = parseNote(massNote);
  const bekannt = new Set(regeln.kategorien.map((k) => k.id));
  const unbekannt = {
    echte: echte.filter((b) => !bekannt.has(b.kategorie)),
    spiel: spiel.filter((z) => !bekannt.has(z.kategorie)),
  };

  return (
    <div className="page" style={{ maxWidth: 1600 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Was wäre, wenn …</div>
          <h1>Spielmodus</h1>
          <p className="lead">Echte Noten (●) bleiben fest, für die offenen CP trägst du vermutete Noten ein. Nichts hier verändert deine echten Daten.</p>
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
        <div className="row between">
          <h3>Strukturcheck</h3>
          <span className="legend">
            <span className="key">
              <span className="sw" style={{ background: "var(--muted)" }} /> echt
            </span>
            <span className="key">
              <span className="sw" style={{ background: "var(--muted)", opacity: 0.4 }} /> angenommen
            </span>
          </span>
        </div>
        <div className="mini-check">
          {check.gruppen.map((g) => (
            <SummenBalken
              key={g.id}
              label={g.id}
              ist={g.ist}
              soll={g.sollCp}
              status={g.status}
              teile={regeln.kategorien.filter((k) => k.gruppe === g.id).map((k) => ({ id: k.id, farbe: kategorieFarbe(regeln, k.id), ...(cpJe.get(k.id) ?? { echt: 0, spiel: 0 }) }))}
            />
          ))}
          <SummenBalken
            label="Gesamt"
            ist={check.gesamt.ist}
            soll={check.gesamt.sollCp}
            status={check.gesamt.status}
            teile={[...cpJe.entries()].map(([id, v]) => ({ id, farbe: kategorieFarbe(regeln, id), ...v }))}
          />
        </div>
        <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <button onClick={() => void setSpiel([...spiel, ...ausPlan(belegungen, spiel)])}>Aus Plan übernehmen</button>
          <button onClick={() => void setSpiel([...spiel, ...offeneCpAuffuellen(erreichteLeistungen(belegungen), spiel, regeln)])}>Offene CP auffüllen</button>
          <label className="check">
            <input type="checkbox" checked={echteZeigen} onChange={(e) => setEchteZeigen(e.target.checked)} /> echte Noten zeigen
          </label>
          <span className="spacer" />
          <button className="ghost" disabled={!spiel.length} onClick={() => setMarkiert(markiert.size === spiel.length ? new Set() : new Set(spiel.map((z) => z.id)))}>
            {spiel.length > 0 && markiert.size === spiel.length ? "Keine markieren" : "Alle markieren"}
          </button>
          <span className="small muted">{markiert.size ? `${markiert.size} markierte auf` : "Markierte auf"}</span>
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
        {spiel.length === 0 ? (
          <p className="small muted" style={{ marginTop: 10 }}>
            Noch keine Spielzeilen. „Aus Plan übernehmen“ holt deine geplanten Module, „Offene CP auffüllen“ ergänzt Platzhalter bis {formatCp(regeln.gesamtCp)} CP.
          </p>
        ) : null}
      </div>

      <div className="spiel-board">
        {regeln.kategorien.map((k) => (
          <KategorieKarte
            key={k.id}
            kat={k}
            farbe={kategorieFarbe(regeln, k.id)}
            bereich={check.kategorien.find((c) => c.id === k.id)}
            echte={echteZeigen ? echte.filter((b) => b.kategorie === k.id) : []}
            echteAnzahl={echte.filter((b) => b.kategorie === k.id).length}
            zeilen={spiel.filter((z) => z.kategorie === k.id)}
            notenOptionen={notenOptionen}
            markiert={markiert}
            toggle={toggle}
            update={update}
            loeschen={(id) => void setSpiel(spiel.filter((x) => x.id !== id))}
            neu={() => neueZeile(k.id)}
          />
        ))}
        {unbekannt.echte.length || unbekannt.spiel.length ? (
          <KategorieKarte
            kat={{ id: "?", name: "Unbekannte Kategorie", kurz: "Unbekannt", zaehltZurNote: true } as Kategorie}
            farbe="var(--faint)"
            echte={echteZeigen ? unbekannt.echte : []}
            echteAnzahl={unbekannt.echte.length}
            zeilen={unbekannt.spiel}
            notenOptionen={notenOptionen}
            markiert={markiert}
            toggle={toggle}
            update={update}
            loeschen={(id) => void setSpiel(spiel.filter((x) => x.id !== id))}
          />
        ) : null}
      </div>
    </div>
  );
}

/** One horizontal bar: segments per category, solid = real, translucent = assumed. */
function SummenBalken({
  label,
  ist,
  soll,
  status,
  teile,
}: {
  label: string;
  ist: number;
  soll: number;
  status: CheckStatus;
  teile: { id: string; farbe: string; echt: number; spiel: number }[];
}) {
  const skala = Math.max(soll, ist) || 1;
  const st = STATUS_PILL[status];
  return (
    <div className="mini-row">
      <strong className="small">{label}</strong>
      <div className="stack-bar" role="img" aria-label={`${label}: ${formatCp(ist)} von ${formatCp(soll)} CP`}>
        {teile.flatMap((t) => [
          t.echt > 0 ? <span key={`${t.id}e`} title={`${t.id}: ${formatCp(t.echt)} CP echt`} style={{ width: `${(t.echt / skala) * 100}%`, background: t.farbe }} /> : null,
          t.spiel > 0 ? (
            <span key={`${t.id}s`} title={`${t.id}: ${formatCp(t.spiel)} CP angenommen`} style={{ width: `${(t.spiel / skala) * 100}%`, background: t.farbe, opacity: 0.4 }} />
          ) : null,
        ])}
      </div>
      <span className="mono small">
        {formatCp(ist)} <span className="faint">/ {formatCp(soll)}</span>
      </span>
      <span className={`pill ${st.cls}`}>{st.text || "–"}</span>
    </div>
  );
}

function ziel(b: BereichCheck): string {
  if (b.minCp != null) return formatCp(b.minCp);
  if (b.maxCp != null) return `max. ${formatCp(b.maxCp)}`;
  return "";
}

function KategorieKarte({
  kat,
  farbe,
  bereich,
  echte,
  echteAnzahl,
  zeilen,
  notenOptionen,
  markiert,
  toggle,
  update,
  loeschen,
  neu,
}: {
  kat: Kategorie;
  farbe: string;
  bereich?: BereichCheck;
  echte: Belegung[];
  echteAnzahl: number;
  zeilen: SpielZeile[];
  notenOptionen: number[];
  markiert: Set<string>;
  toggle: (id: string) => void;
  update: (id: string, patch: Partial<SpielZeile>) => void;
  loeschen: (id: string) => void;
  neu?: () => void;
}) {
  const benotet = kat.zaehltZurNote;
  const st = bereich ? STATUS_PILL[bereich.status] : null;
  const soll = bereich ? bereich.minCp ?? bereich.maxCp : null;
  const pct = bereich && soll ? Math.min(100, (bereich.ist / soll) * 100) : 0;
  const ubName = (id?: string | null) => kat.unterbereiche?.find((u) => u.id === id)?.name.split(" ")[0];

  return (
    <section className="kat-card" style={{ ["--kat" as string]: farbe }}>
      <header>
        <div className="kat-title">
          <span className="swatch" />
          <strong title={kat.name}>{kat.kurz}</strong>
          {!benotet ? <span className="faint small">unbenotet</span> : null}
          <span className="spacer" />
          {bereich ? (
            <span className="mono small">
              {formatCp(bereich.ist)}
              {ziel(bereich) ? <span className="faint"> / {ziel(bereich)}</span> : null}
            </span>
          ) : null}
          {st?.text ? <span className={`pill ${st.cls}`}>{st.text}</span> : null}
          {neu ? (
            <button className="ghost icon" onClick={neu} aria-label={`Zeile in ${kat.kurz} hinzufügen`} title="Zeile hinzufügen">
              +
            </button>
          ) : null}
        </div>
        {bereich && soll ? (
          <div className={`meter kat ${bereich.status === "ueber" ? "ueber" : ""}`} aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {bereich?.unterbereiche.length ? (
          <div className="row small muted" style={{ gap: 10 }}>
            {bereich.unterbereiche.map((u) => (
              <span key={u.id} title={u.name}>
                {ubName(u.id)} {formatCp(u.ist)}
                {u.minCp != null ? `/${formatCp(u.minCp)}` : ""} {u.status === "ok" ? "✓" : ""}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <div className="kat-rows">
        {echte.map((b) => (
          <div key={`b${b.id}`} className="kat-row fixed" title="Echte Note – fest">
            <span className="lock" aria-hidden="true">●</span>
            <span className="t">
              {b.titel}
              {b.unterbereich ? <span className="faint"> · {ubName(b.unterbereich)}</span> : null}
            </span>
            <span className="mono small r">{formatCp(b.cp)}</span>
            <span className="mono note">{b.note100 == null ? "best." : formatNote(b.note100)}</span>
            <span />
          </div>
        ))}
        {zeilen.map((z) => (
          <div key={z.id} className={`kat-row ${z.quelle === "platzhalter" ? "platzhalter" : ""} ${markiert.has(z.id) ? "marked" : ""}`}>
            <input type="checkbox" checked={markiert.has(z.id)} onChange={() => toggle(z.id)} aria-label={`${z.titel} markieren`} />
            <input
              className="t"
              value={z.titel}
              onChange={(e) => update(z.id, { titel: e.target.value })}
              aria-label="Titel"
              title={`${z.titel}${z.quelle === "plan" ? " (aus dem Plan)" : z.quelle === "platzhalter" ? " (Platzhalter)" : ""}${z.unterbereich ? ` · ${ubName(z.unterbereich)}` : ""}`}
            />
            <input className="cp" type="number" min={0.5} step={0.5} value={z.cp} onChange={(e) => update(z.id, { cp: Number(e.target.value) || 0 })} aria-label="CP" />
            {benotet ? (
              <select
                className={`mono note ${z.note100 == null ? "leer" : ""}`}
                value={z.note100 ?? ""}
                onChange={(e) => update(z.id, { note100: e.target.value ? Number(e.target.value) : null })}
                aria-label="Vermutete Note"
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
              <span className="faint small note">–</span>
            )}
            <button className="ghost icon" onClick={() => loeschen(z.id)} aria-label="Zeile löschen">
              ✕
            </button>
          </div>
        ))}
        {!zeilen.length && !echte.length ? <div className="small faint" style={{ padding: "2px 0" }}>{echteAnzahl ? `${echteAnzahl} echte Note(n) ausgeblendet` : "keine Zeilen"}</div> : null}
      </div>
    </section>
  );
}
