// Detail view of one catalog module: description, links, Notenspiegel
// (per exam, comparison, trend, pooled), comments, private note, add to plan.
import { useEffect, useMemo, useState } from "react";
import { formatCp } from "../logic/noten";
import { artVon, chronologisch, kennzahlen, summiere } from "../logic/notenspiegel";
import { openUrl } from "../platform";
import { useStore } from "../store";
import type { Belegung, Modul } from "../types";
import { belegungAusModul, BelegungDialog, semesterOptionen } from "./BelegungDialog";
import { Verlauf, VerteilungChart } from "./Charts";
import { formatDatum, formatProzent, formatSchnitt, KategorieBadge, StatusPill } from "./ui";

const ALLE = "__alle__";

export function ModulDetail({ modul, onClose }: { modul: Modul; onClose: () => void }) {
  const { belegungen, settings, notizen, setNotiz, tags } = useStoreParts();
  const liste = useMemo(() => chronologisch(modul.notenspiegel ?? []), [modul]);
  const [auswahl, setAuswahl] = useState<string>(liste.length ? liste.at(-1)!.termin + "|" + liste.at(-1)!.semester : ALLE);
  const [notiz, setNotizText] = useState(notizen[modul.code] ?? "");
  const [neu, setNeu] = useState<Belegung | null>(null);
  const [semester, setSemester] = useState(settings.erstesSemester);

  useEffect(() => {
    setAuswahl(liste.length ? liste.at(-1)!.termin + "|" + liste.at(-1)!.semester : ALLE);
    setNotizText(notizen[modul.code] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modul.code]);

  const imPlan = belegungen.filter((b) => b.modulCode === modul.code);
  const aktuell = auswahl === ALLE ? null : liste.find((ns) => ns.termin + "|" + ns.semester === auswahl) ?? null;
  const gezeigt = aktuell ?? (liste.length ? { ...summiere(liste), termin: "Alle Termine", semester: "" } : null);
  const k = gezeigt ? kennzahlen(gezeigt) : null;

  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="card detail stack-lg">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="mono small faint">{modul.code}</span>
          <h2>{modul.titel}</h2>
          {modul.titelEn ? <span className="small muted">{modul.titelEn}</span> : null}
        </div>
        <button className="ghost icon" onClick={onClose} aria-label="Detail schließen">
          ✕
        </button>
      </div>

      <div className="row">
        {modul.kategorien.map((kid) => (
          <KategorieBadge key={kid} id={kid} unterbereich={modul.unterbereich} />
        ))}
        {(modul.tags ?? []).map((t) => (
          <span key={t} className="pill">
            {tagName(t)}
          </span>
        ))}
      </div>

      {modul.kurzbeschreibung ? <p>{modul.kurzbeschreibung}</p> : null}

      <dl className="kv">
        <dt>CP</dt>
        <dd className="mono">{formatCp(modul.cp)}</dd>
        <dt>Turnus</dt>
        <dd>{modul.turnus === "WS+SS" ? "jedes Semester" : modul.turnus === "unregelmaessig" ? "unregelmäßig" : modul.turnus}</dd>
        {modul.sprache ? (
          <>
            <dt>Sprache</dt>
            <dd>{modul.sprache}</dd>
          </>
        ) : null}
        {modul.leitung ? (
          <>
            <dt>Leitung</dt>
            <dd>{modul.leitung}</dd>
          </>
        ) : null}
        {modul.pruefung ? (
          <>
            <dt>Prüfung</dt>
            <dd>{modul.pruefung}</dd>
          </>
        ) : null}
        {modul.angebot?.length ? (
          <>
            <dt>Angebot</dt>
            <dd>{modul.angebot.map((a) => `${a.semester}${a.status === "erwartet" ? " (erwartet)" : ""}`).join(", ")}</dd>
          </>
        ) : null}
        {modul.stand ? (
          <>
            <dt>Stand</dt>
            <dd>{formatDatum(modul.stand)}</dd>
          </>
        ) : null}
      </dl>

      {modul.links?.modul || modul.links?.lehrveranstaltungen?.length ? (
        <div className="row">
          {modul.links?.modul ? <button onClick={() => openUrl(modul.links!.modul!)}>Modulbeschreibung ↗</button> : null}
          {(modul.links?.lehrveranstaltungen ?? []).map((l) => (
            <button key={l.url} onClick={() => openUrl(l.url)}>
              Lehrveranstaltung {l.semester} ↗
            </button>
          ))}
        </div>
      ) : null}

      <section className="stack">
        <h3>Notenspiegel</h3>
        {!liste.length || !gezeigt || !k ? (
          <p className="muted small">Noch kein Notenspiegel.</p>
        ) : (
          <>
            <div className="row" role="group" aria-label="Prüfungstermin">
              {liste.map((ns) => {
                const id = ns.termin + "|" + ns.semester;
                return (
                  <button key={id} className="chip" aria-pressed={auswahl === id} onClick={() => setAuswahl(id)} title={ns.termin}>
                    {ns.semester}
                    {artVon(ns, modul) === "Wiederholung" ? " · Wdh." : ""}
                  </button>
                );
              })}
              {liste.length > 1 ? (
                <button className="chip" aria-pressed={auswahl === ALLE} onClick={() => setAuswahl(ALLE)}>
                  Alle zusammen
                </button>
              ) : null}
            </div>
            {aktuell ? (
              <p className="small muted">
                {aktuell.termin} · {artVon(aktuell, modul)}
                {aktuell.pruefungsdatum ? ` · ${formatDatum(aktuell.pruefungsdatum)}` : ""}
              </p>
            ) : (
              <p className="small muted">Alle {liste.length} Termine addiert.</p>
            )}
            <div className="grid-3" style={{ gap: 10 }}>
              <Stat label="Ø bestanden" wert={formatSchnitt(k.schnittBestanden)} />
              <Stat label="Durchfallquote" wert={formatProzent(k.durchfallquote)} />
              <Stat label="Angetreten / angemeldet" wert={`${k.angetreten} / ${k.angemeldet}`} />
            </div>
            <VerteilungChart verteilung={gezeigt.verteilung} nichtErschienen={gezeigt.nichtErschienen} titel={aktuell ? aktuell.termin : "alle Termine"} />
            <p className="small faint">Ø gesamt (inkl. nicht bestanden): {formatSchnitt(k.schnittGesamt)}</p>

            {liste.length > 1 ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Termin</th>
                        <th>Art</th>
                        <th className="r">Angetr.</th>
                        <th className="r">Ø best.</th>
                        <th className="r">Ø ges.</th>
                        <th className="r">Durchfall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.map((ns) => {
                        const kk = kennzahlen(ns);
                        return (
                          <tr key={ns.termin + ns.semester}>
                            <td>
                              {ns.semester} <span className="faint mono small">{ns.termin}</span>
                            </td>
                            <td className="small">{artVon(ns, modul)}</td>
                            <td className="num">{kk.angetreten}</td>
                            <td className="num">{formatSchnitt(kk.schnittBestanden)}</td>
                            <td className="num">{formatSchnitt(kk.schnittGesamt)}</td>
                            <td className="num">{formatProzent(kk.durchfallquote)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="spark-row">
                  <Verlauf
                    titel="Ø bestanden je Termin"
                    punkte={liste.map((ns) => ({ label: ns.semester, wert: kennzahlen(ns).schnittBestanden }))}
                    format={(v) => v.toFixed(1).replace(".", ",")}
                    yMin={1}
                    yMax={4}
                  />
                  <Verlauf
                    titel="Durchfallquote je Termin"
                    punkte={liste.map((ns) => ({ label: ns.semester, wert: kennzahlen(ns).durchfallquote }))}
                    format={(v) => `${Math.round(v * 100)} %`}
                    yMin={0}
                    yMax={Math.max(0.5, ...liste.map((ns) => kennzahlen(ns).durchfallquote ?? 0))}
                  />
                </div>
              </>
            ) : null}
          </>
        )}
      </section>

      {modul.kommentare?.length ? (
        <section className="stack">
          <h3>Kommentare</h3>
          {modul.kommentare.map((c, i) => (
            <div key={i} className="comment">
              <p>{c.text}</p>
              <p className="small faint">
                {c.von ?? "anonym"}
                {c.datum ? ` · ${formatDatum(c.datum)}` : ""}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="stack">
        <h3>Mein Plan</h3>
        {imPlan.length ? (
          imPlan.map((b) => (
            <div key={b.id} className="row small">
              <StatusPill status={b.status} />
              <span>{b.semester === "ohne" ? "ohne Termin" : b.semester === "vor" ? "vor dem Master" : b.semester}</span>
            </div>
          ))
        ) : (
          <p className="small muted">Noch nicht im Plan.</p>
        )}
        <div className="row">
          <select value={semester} onChange={(e) => setSemester(e.target.value)} aria-label="Semester">
            {semesterOptionen(settings).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => setNeu(belegungAusModul(modul, { semester, status: "geplant" }))}>
            Zum Plan hinzufügen
          </button>
        </div>
      </section>

      <section className="stack">
        <h3>Meine Notiz</h3>
        <textarea
          value={notiz}
          onChange={(e) => setNotizText(e.target.value)}
          onBlur={() => notiz !== (notizen[modul.code] ?? "") && void setNotiz(modul.code, notiz)}
          placeholder="Nur für dich, wird nicht geteilt."
        />
      </section>

      {modul.quellen?.length ? <p className="small faint">Quellen: {modul.quellen.join(" · ")}</p> : null}
      {neu ? <BelegungDialog start={neu} onClose={() => setNeu(null)} /> : null}
    </div>
  );
}

function Stat({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="kpi" style={{ padding: "10px 12px" }}>
      <span className="eyebrow">{label}</span>
      <span className="mid" style={{ fontSize: 19 }}>
        {wert}
      </span>
    </div>
  );
}

function useStoreParts() {
  const s = useStore();
  return { belegungen: s.belegungen, settings: s.settings, notizen: s.notizen, setNotiz: s.setNotiz, tags: s.shared?.tags ?? [] };
}
