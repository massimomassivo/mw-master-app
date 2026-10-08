// Grade maths: weighted average, certificate grade, predicate, structure
// check and deadlines. Pure functions, unit-tested in noten.test.ts.
//
// Grades are integers in hundredths (1,3 -> 130) and CP are integers in
// tenths (5 -> 50). All sums are integer arithmetic. With floating point,
// an average of exactly 1,3 can come out as 1,2999… and would be cut to 1,2
// instead of 1,3 — this module never does that.
import type { Belegung, Frist, Kategorie, Regeln } from "../types";
import { ERREICHT } from "../types";
import { fachsemester, parseSemester, semesterAt, VOR_MASTER } from "./semester";

// ---------------- parsing / formatting ----------------

/** "1,3" / "1.3" / "1" -> 130. Allows one decimal (all TUM steps and converted grades). */
export function parseNote(input: string): number | null {
  const t = input.trim().replace(",", ".");
  if (!/^\d(\.\d)?$/.test(t)) return null;
  const n = Math.round(Number(t) * 10) * 10;
  return n >= 100 && n <= 500 ? n : null;
}

/** 130 -> "1,3"; 125 -> "1,25" (only where hundredths matter). */
export function formatNote(n100: number | null | undefined, stellen: 1 | 2 = 1): string {
  if (n100 == null) return "–";
  const v = stellen === 1 ? (n100 / 100).toFixed(1) : (n100 / 100).toFixed(2);
  return v.replace(".", ",");
}

export function formatCp(cp: number): string {
  return Number.isInteger(cp) ? String(cp) : cp.toFixed(1).replace(".", ",");
}

/** Whether the grade is one of the regular TUM steps from regeln.json. */
export function istNotenstufe(n100: number, regeln: Pick<Regeln, "notenstufen">): boolean {
  return regeln.notenstufen.some((s) => Math.round(s * 100) === n100);
}

const cp10 = (cp: number) => Math.round(cp * 10);

/** Exact integer division for non-negative integers. */
function intDiv(a: number, b: number): number {
  return (a - (a % b)) / b;
}

// ---------------- average ----------------

export interface Leistung {
  cp: number;
  kategorie: string;
  unterbereich?: string | null;
  /** null = passed without a grade */
  note100: number | null;
}

export interface Schnitt {
  /** Certificate grade in tenths (1,2 -> 12), cut after the first decimal. null = no graded CP. */
  zeugnis10: number | null;
  /** Exact average in hundredths, also cut (never rounded up), so it never contradicts the certificate grade. */
  exakt100: number | null;
  praedikat: string | null;
  auszeichnung: boolean;
  /** CP that enter the average. */
  benoteteCp: number;
  /** All CP counted, graded or not. */
  gesamtCp: number;
  unbenoteteCp: number;
}

export function kategorieVon(regeln: Regeln, id: string): Kategorie | undefined {
  return regeln.kategorien.find((k) => k.id === id);
}

/**
 * Weighted average over the given achievements. Only graded entries in
 * categories with `zaehltZurNote` enter the average; everything counts for CP.
 */
export function berechneSchnitt(leistungen: Leistung[], regeln: Regeln): Schnitt {
  let num = 0; // Σ note100 · cp10
  let den = 0; // Σ cp10
  let gesamt10 = 0;
  for (const l of leistungen) {
    const w = cp10(l.cp);
    gesamt10 += w;
    const kat = kategorieVon(regeln, l.kategorie);
    if (l.note100 != null && kat?.zaehltZurNote) {
      num += l.note100 * w;
      den += w;
    }
  }
  const benoteteCp = den / 10;
  const gesamtCp = gesamt10 / 10;
  if (den === 0) {
    return { zeugnis10: null, exakt100: null, praedikat: null, auszeichnung: false, benoteteCp, gesamtCp, unbenoteteCp: gesamtCp };
  }
  const exakt100 = intDiv(num, den);
  const zeugnis10 = intDiv(num, den * 10);
  return {
    zeugnis10,
    exakt100,
    praedikat: praedikatFuer(zeugnis10, regeln),
    auszeichnung: regeln.auszeichnung ? zeugnis10 <= Math.round(regeln.auszeichnung.bis * 10) : false,
    benoteteCp,
    gesamtCp,
    unbenoteteCp: Math.round((gesamtCp - benoteteCp) * 10) / 10,
  };
}

export function praedikatFuer(zeugnis10: number, regeln: Pick<Regeln, "praedikate">): string | null {
  const sorted = [...regeln.praedikate].sort((a, b) => a.bis - b.bis);
  for (const p of sorted) if (zeugnis10 <= Math.round(p.bis * 10)) return p.name;
  return null;
}

/** Achieved records (passed or recognised) as Leistungen. */
export function erreichteLeistungen(belegungen: Belegung[]): Leistung[] {
  return belegungen
    .filter((b) => ERREICHT.includes(b.status))
    .map((b) => ({ cp: b.cp, kategorie: b.kategorie, unterbereich: b.unterbereich, note100: b.note100 }));
}

// ---------------- structure check ----------------

export type CheckStatus = "offen" | "ok" | "frei" | "ueber";

export interface BereichCheck {
  id: string;
  name: string;
  kurz: string;
  ist: number;
  minCp: number | null;
  maxCp: number | null;
  /** Number of entries (for "genau ein Modul"). */
  anzahl: number;
  status: CheckStatus;
  unterbereiche: BereichCheck[];
}

export interface StrukturCheck {
  kategorien: BereichCheck[];
  gruppen: { id: string; ist: number; sollCp: number; status: CheckStatus }[];
  gesamt: { ist: number; sollCp: number; status: CheckStatus };
}

function statusFuer(ist: number, min: number | null, max: number | null, zuVieleModule = false): CheckStatus {
  if ((max != null && ist > max + 1e-9) || zuVieleModule) return "ueber";
  if (min != null) return ist + 1e-9 >= min ? "ok" : "offen";
  return "frei";
}

/**
 * CP per category (and sub-area) against regeln.json. Minimums are targets,
 * only a maximum that is exceeded is a problem (docs/ANFORDERUNGEN.md 5.3).
 */
export function strukturCheck(leistungen: Leistung[], regeln: Regeln): StrukturCheck {
  const sum = (pred: (l: Leistung) => boolean) =>
    Math.round(leistungen.filter(pred).reduce((a, l) => a + l.cp, 0) * 10) / 10;

  const kategorien = regeln.kategorien.map((k): BereichCheck => {
    const ist = sum((l) => l.kategorie === k.id);
    const anzahl = leistungen.filter((l) => l.kategorie === k.id).length;
    const unterbereiche = (k.unterbereiche ?? []).map((u): BereichCheck => {
      const uist = sum((l) => l.kategorie === k.id && l.unterbereich === u.id);
      return {
        id: u.id,
        name: u.name,
        kurz: u.name,
        ist: uist,
        minCp: u.minCp ?? null,
        maxCp: null,
        anzahl: leistungen.filter((l) => l.kategorie === k.id && l.unterbereich === u.id).length,
        status: statusFuer(uist, u.minCp ?? null, null),
        unterbereiche: [],
      };
    });
    let status = statusFuer(ist, k.minCp ?? null, k.maxCp ?? null, !!k.genauEinModul && anzahl > 1);
    if (status === "ok" && unterbereiche.some((u) => u.status === "offen")) status = "offen";
    return { id: k.id, name: k.name, kurz: k.kurz, ist, minCp: k.minCp ?? null, maxCp: k.maxCp ?? null, anzahl, status, unterbereiche };
  });

  const gruppen = (regeln.gruppen ?? []).map((g) => {
    const ids = regeln.kategorien.filter((k) => k.gruppe === g.id).map((k) => k.id);
    const ist = sum((l) => ids.includes(l.kategorie));
    return { id: g.id, ist, sollCp: g.sollCp, status: statusFuer(ist, g.sollCp, null) };
  });

  const ist = sum(() => true);
  return { kategorien, gruppen, gesamt: { ist, sollCp: regeln.gesamtCp, status: statusFuer(ist, regeln.gesamtCp, null) } };
}

// ---------------- deadlines ----------------

export interface FristCheck {
  frist: Frist;
  erfuellt: boolean;
  /** Current Fachsemester (null if the first semester is unknown). */
  aktuellesFachsemester: number | null;
  /** True when not fulfilled and the deadline semester has been reached. */
  dringend: boolean;
}

export function fristenCheck(belegungen: Belegung[], regeln: Regeln, erstesSemester: string, heute: Date): FristCheck[] {
  const fs = parseSemester(erstesSemester) ? fachsemester(erstesSemester, semesterAt(heute)) : null;
  return (regeln.fristen ?? []).map((frist) => {
    const n = belegungen.filter(
      (b) => (b.status === "bestanden" || b.status === "anerkannt") && frist.kategorien.includes(b.kategorie),
    ).length;
    const erfuellt = n >= frist.minModule;
    return { frist, erfuellt, aktuellesFachsemester: fs, dringend: !erfuellt && fs != null && fs >= frist.bisFachsemester };
  });
}

/** Records before the master (pre-taken modules) count like any other. */
export function istVorMaster(b: Belegung): boolean {
  return b.semester === VOR_MASTER;
}
