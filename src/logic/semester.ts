// Semesters: "WS 26/27" (winter, Oct–Mar) and "SS 27" (summer, Apr–Sep).
// Pure functions, unit-tested in semester.test.ts.
import type { TerminArt, Turnus } from "../types";

export interface Sem {
  art: "WS" | "SS";
  /** Full calendar year the semester starts in (WS 26/27 -> 2026, SS 27 -> 2027). */
  jahr: number;
}

/** Pseudo-semesters used in the plan. */
export const VOR_MASTER = "vor";
export const OHNE_TERMIN = "ohne";

export function parseSemester(s: string): Sem | null {
  const t = s.trim();
  let m = /^WS\s*(\d{2})\s*\/\s*(\d{2})$/i.exec(t);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if ((a + 1) % 100 !== b) return null;
    return { art: "WS", jahr: 2000 + a };
  }
  m = /^SS\s*(\d{2})$/i.exec(t);
  if (m) return { art: "SS", jahr: 2000 + Number(m[1]) };
  return null;
}

export function formatSemester(s: Sem): string {
  const yy = s.jahr % 100;
  const pad = (n: number) => String(n).padStart(2, "0");
  return s.art === "WS" ? `WS ${pad(yy)}/${pad((yy + 1) % 100)}` : `SS ${pad(yy)}`;
}

/** Monotonic index: SS 2027 = 2*2027, WS 2026/27 = 2*2026 + 1 (comes right before SS 2027). */
export function semesterIndex(s: Sem): number {
  return s.art === "SS" ? 2 * s.jahr : 2 * s.jahr + 1;
}

export function fromIndex(i: number): Sem {
  return i % 2 === 0 ? { art: "SS", jahr: i / 2 } : { art: "WS", jahr: (i - 1) / 2 };
}

/** Sort key for semester strings; unknown strings sort first ("vor") or last ("ohne", other). */
export function semesterSortKey(s: string): number {
  if (s === VOR_MASTER) return -1;
  const p = parseSemester(s);
  return p ? semesterIndex(p) : Number.MAX_SAFE_INTEGER;
}

export function compareSemester(a: string, b: string): number {
  return semesterSortKey(a) - semesterSortKey(b);
}

/** `count` consecutive semesters starting with `start`. */
export function semesterRange(start: string, count: number): string[] {
  const p = parseSemester(start);
  if (!p) return [];
  const i0 = semesterIndex(p);
  return Array.from({ length: count }, (_, k) => formatSemester(fromIndex(i0 + k)));
}

/** Semester a date falls in: WS from October to March, SS from April to September. */
export function semesterAt(date: Date): Sem {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  if (m >= 10) return { art: "WS", jahr: y };
  if (m <= 3) return { art: "WS", jahr: y - 1 };
  return { art: "SS", jahr: y };
}

/** 1-based Fachsemester of `s` relative to the first master semester. */
export function fachsemester(erstes: string, s: Sem): number | null {
  const p = parseSemester(erstes);
  if (!p) return null;
  return semesterIndex(s) - semesterIndex(p) + 1;
}

/**
 * Semester from an exam label like "FA 24W" or "25S": the last
 * two-digit year followed by W or S. "24W" -> "WS 24/25", "25S" -> "SS 25".
 */
export function semesterFromTermin(termin: string): string | null {
  const all = [...termin.matchAll(/(\d{2})\s*([WS])(?![A-Za-z])/gi)];
  const m = all.at(-1);
  if (!m) return null;
  const yy = Number(m[1]);
  return formatSemester({ art: m[2].toUpperCase() === "W" ? "WS" : "SS", jahr: 2000 + yy });
}

/**
 * Main or repeat exam, from the module's Turnus: an exam is offered once per
 * semester, so an exam in the teaching semester is the main one and an exam
 * in the other semester is the repeat (docs/ANFORDERUNGEN.md 5.5).
 */
export function terminArt(turnus: Turnus, semester: string): TerminArt {
  const p = parseSemester(semester);
  if (!p) return "unbekannt";
  switch (turnus) {
    case "WS+SS":
      return "Haupttermin";
    case "WS":
    case "SS":
      return p.art === turnus ? "Haupttermin" : "Wiederholung";
    default:
      return "unbekannt";
  }
}

/** Whether a module's Turnus fits a planned semester (only used for a soft hint). */
export function passtZumTurnus(turnus: Turnus, semester: string): boolean {
  const p = parseSemester(semester);
  if (!p || turnus === "WS+SS" || turnus === "unregelmaessig") return true;
  return p.art === turnus;
}
