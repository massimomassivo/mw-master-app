// Structure check: CP per category against the rules, as compact meters.
import { formatCp, type BereichCheck, type CheckStatus, type StrukturCheck } from "../logic/noten";
import { useStore } from "../store";
import { kategorieFarbe } from "./ui";

const STATUS_TEXT: Record<CheckStatus, { text: string; cls: string }> = {
  ok: { text: "OK", cls: "ok" },
  offen: { text: "offen", cls: "" },
  frei: { text: "", cls: "" },
  ueber: { text: "über Maximum", cls: "bad" },
};

function ziel(c: Pick<BereichCheck, "minCp" | "maxCp">): string {
  if (c.minCp != null && c.maxCp != null && c.minCp === c.maxCp) return `${formatCp(c.minCp)}`;
  if (c.minCp != null) return `${formatCp(c.minCp)}`;
  if (c.maxCp != null) return `max. ${formatCp(c.maxCp)}`;
  return "";
}

function Meter({ ist, soll, status }: { ist: number; soll: number | null; status: CheckStatus }) {
  const pct = soll ? Math.min(100, (ist / soll) * 100) : ist > 0 ? 100 : 0;
  return (
    <div className={`meter ${status === "ok" ? "ok" : status === "ueber" ? "ueber" : ""}`} aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StrukturListe({ check, titel }: { check: StrukturCheck; titel?: string }) {
  const { regeln } = useStore();
  const gruppenIds = new Set(check.gruppen.map((g) => g.id));
  return (
    <div className="stack">
      {titel ? <h3>{titel}</h3> : null}
      <div className="check-list">
        {check.gruppen.map((g) => (
          <div key={g.id} className="check-item">
            <span />
            <strong>{g.id}</strong>
            <span className="mono small">
              {formatCp(g.ist)} / {formatCp(g.sollCp)}
            </span>
            <span className={`pill ${STATUS_TEXT[g.status].cls}`}>{STATUS_TEXT[g.status].text || "–"}</span>
            <Meter ist={g.ist} soll={g.sollCp} status={g.status} />
          </div>
        ))}
        {check.kategorien.map((k) => {
          const inGruppe = regeln.kategorien.find((x) => x.id === k.id)?.gruppe;
          const st = STATUS_TEXT[k.status];
          return (
            <div key={k.id} className="stack" style={{ gap: 6 }}>
              <div className={`check-item ${inGruppe && gruppenIds.has(inGruppe) ? "sub" : ""}`}>
                <span className="swatch" style={{ background: kategorieFarbe(regeln, k.id) }} />
                <span title={k.name}>{k.name}</span>
                <span className="mono small">
                  {formatCp(k.ist)}
                  {ziel(k) ? <span className="faint"> / {ziel(k)}</span> : null}
                </span>
                {st.text ? <span className={`pill ${st.cls}`}>{st.text}</span> : <span />}
                <Meter ist={k.ist} soll={k.minCp ?? k.maxCp} status={k.status} />
              </div>
              {k.unterbereiche.map((u) => (
                <div key={u.id} className="check-item sub">
                  <span />
                  <span>{u.name}</span>
                  <span className="mono small">
                    {formatCp(u.ist)}
                    {u.minCp != null ? <span className="faint"> / {formatCp(u.minCp)}</span> : null}
                  </span>
                  <span className={`pill ${STATUS_TEXT[u.status].cls}`}>{STATUS_TEXT[u.status].text || "–"}</span>
                </div>
              ))}
            </div>
          );
        })}
        <div className="check-item" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <span />
          <strong>Gesamt</strong>
          <span className="mono small">
            {formatCp(check.gesamt.ist)} / {formatCp(check.gesamt.sollCp)}
          </span>
          <span className={`pill ${STATUS_TEXT[check.gesamt.status].cls}`}>{STATUS_TEXT[check.gesamt.status].text || "–"}</span>
          <Meter ist={check.gesamt.ist} soll={check.gesamt.sollCp} status={check.gesamt.status} />
        </div>
      </div>
    </div>
  );
}
