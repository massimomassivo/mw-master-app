// "Katalog": all modules from the shared folder with filters, sorting and a detail panel.
import { useMemo, useState } from "react";
import { formatCp } from "../logic/noten";
import { kennzahlen, neuesterHaupttermin } from "../logic/notenspiegel";
import { useStore } from "../store";
import type { Modul } from "../types";
import { ModulDetail } from "./ModulDetail";
import { formatProzent, formatSchnitt, KategorieBadge } from "./ui";

type SortKey = "titel" | "code" | "cp" | "turnus" | "schnitt" | "durchfall";

export function Katalog({ zuEinstellungen }: { zuEinstellungen: () => void }) {
  const { shared, belegungen, regeln } = useStore();
  const [q, setQ] = useState("");
  const [kat, setKat] = useState("");
  const [tag, setTag] = useState("");
  const [turnus, setTurnus] = useState("");
  const [angebot, setAngebot] = useState("");
  const [sprache, setSprache] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "titel", asc: true });
  const [sel, setSel] = useState<string | null>(null);

  const module = shared?.module ?? [];
  const imPlan = useMemo(() => new Set(belegungen.map((b) => b.modulCode).filter(Boolean)), [belegungen]);
  const angebotSemester = useMemo(() => [...new Set(module.flatMap((m) => (m.angebot ?? []).map((a) => a.semester)))].sort(), [module]);
  const sprachen = useMemo(() => [...new Set(module.map((m) => m.sprache).filter((x): x is string => !!x))].sort(), [module]);

  const stat = useMemo(() => {
    const map = new Map<string, { schnitt: number | null; durchfall: number | null; termine: number }>();
    for (const m of module) {
      const ns = neuesterHaupttermin(m);
      const k = ns ? kennzahlen(ns) : null;
      map.set(m.code, { schnitt: k?.schnittBestanden ?? null, durchfall: k?.durchfallquote ?? null, termine: m.notenspiegel?.length ?? 0 });
    }
    return map;
  }, [module]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = module.filter(
      (m) =>
        (!kat || m.kategorien.includes(kat)) &&
        (!tag || (m.tags ?? []).includes(tag)) &&
        (!turnus || m.turnus === turnus || (turnus !== "unregelmaessig" && m.turnus === "WS+SS")) &&
        (!angebot || (m.angebot ?? []).some((a) => a.semester === angebot)) &&
        (!sprache || m.sprache === sprache) &&
        (!needle || `${m.titel} ${m.titelEn ?? ""} ${m.code} ${m.leitung ?? ""}`.toLowerCase().includes(needle)),
    );
    const val = (m: Modul): string | number => {
      switch (sort.key) {
        case "code":
          return m.code;
        case "cp":
          return m.cp;
        case "turnus":
          return m.turnus;
        case "schnitt":
          return stat.get(m.code)?.schnitt ?? 99;
        case "durchfall":
          return stat.get(m.code)?.durchfall ?? 99;
        default:
          return m.titel.toLowerCase();
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "de");
      return sort.asc ? c : -c;
    });
  }, [module, q, kat, tag, turnus, angebot, sprache, sort, stat]);

  const selModul = sel ? module.find((m) => m.code === sel) ?? null : null;
  // With the detail panel open, the table drops two columns so nothing scrolls sideways.
  const kompakt = !!selModul;

  if (!shared) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="eyebrow">Gemeinsamer Katalog</div>
            <h1>Modulkatalog</h1>
          </div>
        </div>
        <div className="card empty">
          Noch kein geteilter Ordner verknüpft.{" "}
          <button className="primary" onClick={zuEinstellungen} style={{ marginLeft: 8 }}>
            Ordner wählen
          </button>
        </div>
      </div>
    );
  }

  const th = (key: SortKey, label: string, cls = "") => (
    <th
      className={`sortable ${cls}`}
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
      aria-sort={sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"}
    >
      {label}
      {sort.key === key ? (sort.asc ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="page" style={{ maxWidth: selModul ? 1440 : undefined }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gemeinsamer Katalog · {module.length} Module</div>
          <h1>Modulkatalog</h1>
          <p className="lead">Nur lesbar. Ø und Durchfallquote vom neuesten Haupttermin; alle Termine in der Detailansicht.</p>
        </div>
      </div>

      <div className="stack">
        <div className="filters">
          <input type="search" placeholder="Suche nach Titel, Nummer, Dozent" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Suche" />
          <select value={kat} onChange={(e) => setKat(e.target.value)} aria-label="Kategorie">
            <option value="">Alle Kategorien</option>
            {regeln.kategorien.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          <select value={turnus} onChange={(e) => setTurnus(e.target.value)} aria-label="Turnus">
            <option value="">WS und SS</option>
            <option value="WS">läuft im WS</option>
            <option value="SS">läuft im SS</option>
            <option value="unregelmaessig">unregelmäßig</option>
          </select>
          {angebotSemester.length ? (
            <select value={angebot} onChange={(e) => setAngebot(e.target.value)} aria-label="Angebot im Semester">
              <option value="">Angebot: egal</option>
              {angebotSemester.map((s) => (
                <option key={s} value={s}>
                  angeboten {s}
                </option>
              ))}
            </select>
          ) : null}
          {sprachen.length > 1 ? (
            <select value={sprache} onChange={(e) => setSprache(e.target.value)} aria-label="Sprache">
              <option value="">Sprache: egal</option>
              {sprachen.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {shared.tags.length ? (
          <div className="filters" role="group" aria-label="Themen">
            <button className="chip" aria-pressed={tag === ""} onClick={() => setTag("")}>
              Alle Themen
            </button>
            {shared.tags.map((t) => (
              <button key={t.id} className="chip" aria-pressed={tag === t.id} onClick={() => setTag(tag === t.id ? "" : t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`catalog ${selModul ? "with-detail" : ""}`}>
        <div className="card flat">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {th("titel", "Modul")}
                  {th("cp", "CP", "r")}
                  {kompakt ? null : <th>Kategorie</th>}
                  {kompakt ? null : th("turnus", "Turnus")}
                  {th("schnitt", "Ø best.", "r")}
                  {th("durchfall", "Durchfall", "r")}
                  <th className="c">Plan</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={kompakt ? 5 : 7} className="empty">
                      Kein Modul passt zu diesen Filtern.
                    </td>
                  </tr>
                ) : (
                  rows.map((m) => {
                    const s = stat.get(m.code);
                    return (
                      <tr key={m.code} className={`clickable ${sel === m.code ? "selected" : ""}`} onClick={() => setSel(sel === m.code ? null : m.code)}>
                        <td>
                          <div>{m.titel}</div>
                          <div className="small faint mono">
                            {m.code}
                            {m.sprache ? ` · ${m.sprache}` : ""}
                            {m.kommentare?.length ? ` · ${m.kommentare.length} Kommentar${m.kommentare.length > 1 ? "e" : ""}` : ""}
                            {kompakt ? ` · ${turnusKurz(m)}` : ""}
                          </div>
                        </td>
                        <td className="num">{formatCp(m.cp)}</td>
                        {kompakt ? null : (
                          <td>
                            <div className="row" style={{ gap: 4 }}>
                              {m.kategorien.map((k) => (
                                <KategorieBadge key={k} id={k} />
                              ))}
                            </div>
                          </td>
                        )}
                        {kompakt ? null : <td className="small">{turnusKurz(m)}</td>}
                        <td className="num">
                          {formatSchnitt(s?.schnitt ?? null)}
                          {s && s.termine > 1 ? <span className="faint small"> ({s.termine})</span> : null}
                        </td>
                        <td className="num">{formatProzent(s?.durchfall ?? null)}</td>
                        <td className="c">{imPlan.has(m.code) ? "✓" : ""}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        {selModul ? <ModulDetail modul={selModul} onClose={() => setSel(null)} /> : null}
      </div>
    </div>
  );
}

function turnusKurz(m: Modul): string {
  return m.turnus === "WS+SS" ? "WS + SS" : m.turnus === "unregelmaessig" ? "unregelm." : m.turnus;
}
