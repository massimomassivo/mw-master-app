// Charts for the Notenspiegel. Plain SVG, no chart library.
// Specs from the dataviz guidelines: columns ≤ 24px with a 4px rounded top and
// square base, hairline grid, 2px lines, ≥ 8px markers with a surface ring,
// hover tooltips, legend for more than one series, text never in data colours.
import { useState } from "react";
import { sichtbareStufen } from "../logic/notenspiegel";

const W = 560;
const H = 210;
const PAD = { l: 34, r: 8, t: 14, b: 26 };

function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 4, step: 1 };
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const s = Math.max(1, Math.round(step));
  return { max: Math.ceil(v / s) * s, step: s };
}

/** Column with rounded top corners (r) and a square base. */
function colPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function VerteilungChart({ verteilung, nichtErschienen, titel }: { verteilung: Record<string, number>; nichtErschienen: number; titel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const stufen = sichtbareStufen(verteilung);
  const angetreten = stufen.reduce((a, s) => a + (verteilung[s] ?? 0), 0);
  const slots = [
    ...stufen.map((s) => ({ label: s.replace(".", ","), n: verteilung[s] ?? 0, art: Number(s) <= 4 ? "pass" : "fail" })),
    { label: "n. e.", n: nichtErschienen, art: "absent" },
  ];
  const { max, step } = niceMax(Math.max(...slots.map((s) => s.n)));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  // one extra half slot of air before "nicht erschienen"
  const slotW = innerW / (slots.length + 0.5);
  const barW = Math.min(24, slotW - 4);
  const xOf = (i: number) => PAD.l + (i + (i === slots.length - 1 ? 0.5 : 0)) * slotW + (slotW - barW) / 2;
  const yOf = (n: number) => PAD.t + innerH - (n / max) * innerH;
  const fill = (art: string) => (art === "pass" ? "var(--chart-pass)" : art === "fail" ? "var(--chart-fail)" : "var(--chart-absent)");
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);

  const h = hover != null ? slots[hover] : null;
  const pct = (n: number, von: number) => (von ? `${((n / von) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %` : "–");

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="legend" aria-hidden="true">
        <span className="key"><span className="sw" style={{ background: "var(--chart-pass)" }} />bestanden</span>
        <span className="key"><span className="sw" style={{ background: "var(--chart-fail)" }} />nicht bestanden</span>
        <span className="key"><span className="sw" style={{ background: "var(--chart-absent)" }} />nicht erschienen</span>
      </div>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Notenverteilung ${titel}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={yOf(t)} y2={yOf(t)} />
              <text x={PAD.l - 6} y={yOf(t) + 3.5} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {slots.map((s, i) => (
            <g key={s.label}>
              <path d={colPath(xOf(i), yOf(s.n), barW, yOf(0) - yOf(s.n))} fill={fill(s.art)} opacity={hover == null || hover === i ? 1 : 0.55} />
              <text x={xOf(i) + barW / 2} y={H - 8} textAnchor="middle">
                {s.label}
              </text>
              <rect
                className="hit"
                x={PAD.l + (i + (i === slots.length - 1 ? 0.5 : 0)) * slotW}
                y={PAD.t}
                width={slotW}
                height={innerH + PAD.b}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}
        </svg>
        {h && hover != null ? (
          <div className="tooltip" style={{ left: `${((xOf(hover) + barW / 2) / W) * 100}%`, top: `${(yOf(h.n) / H) * 100}%` }}>
            {h.art === "absent" ? "nicht erschienen" : `Note ${h.label}`}: <strong>{h.n}</strong>
            {h.art === "absent" ? "" : ` · ${pct(h.n, angetreten)}`}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const SW = 260;
const SH = 92;
const SP = { l: 30, r: 34, t: 10, b: 20 };

export function Verlauf({
  titel,
  punkte,
  format,
  yMin,
  yMax,
}: {
  titel: string;
  punkte: { label: string; wert: number | null }[];
  format: (v: number) => string;
  yMin: number;
  yMax: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = punkte.map((p, i) => ({ ...p, i })).filter((p): p is { label: string; wert: number; i: number } => p.wert != null);
  const n = punkte.length;
  const xOf = (i: number) => SP.l + (n <= 1 ? (SW - SP.l - SP.r) / 2 : (i / (n - 1)) * (SW - SP.l - SP.r));
  const yOf = (v: number) => SP.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (SH - SP.t - SP.b);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${xOf(p.i)},${yOf(p.wert)}`).join("");
  const last = pts.at(-1);
  const h = hover != null ? punkte[hover] : null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="small muted">{titel}</span>
      <div className="chart">
        <svg viewBox={`0 0 ${SW} ${SH}`} role="img" aria-label={titel}>
          {[yMin, yMax].map((t) => (
            <g key={t}>
              <line className="grid" x1={SP.l} x2={SW - SP.r} y1={yOf(t)} y2={yOf(t)} />
              <text x={SP.l - 5} y={yOf(t) + 3.5} textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          <path d={d} fill="none" stroke="var(--chart-pass)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p) => (
            <circle key={p.i} cx={xOf(p.i)} cy={yOf(p.wert)} r={4} fill="var(--chart-pass)" stroke="var(--surface)" strokeWidth={2} />
          ))}
          {last ? (
            <text x={xOf(last.i) + 8} y={yOf(last.wert) + 3.5} style={{ fill: "var(--ink)" }}>
              {format(last.wert)}
            </text>
          ) : null}
          {punkte.map((p, i) => (
            <g key={p.label + i}>
              {i === 0 || i === n - 1 ? (
                <text x={xOf(i)} y={SH - 5} textAnchor={n === 1 ? "middle" : i === 0 ? "start" : "end"}>
                  {p.label}
                </text>
              ) : null}
              <rect
                className="hit"
                x={xOf(i) - (SW - SP.l - SP.r) / Math.max(1, n - 1) / 2}
                y={0}
                width={(SW - SP.l - SP.r) / Math.max(1, n - 1)}
                height={SH}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}
        </svg>
        {h && hover != null ? (
          <div className="tooltip" style={{ left: `${(xOf(hover) / SW) * 100}%`, top: `${((h.wert != null ? yOf(h.wert) : SP.t) / SH) * 100}%` }}>
            {h.label}: <strong>{h.wert == null ? "–" : format(h.wert)}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}
