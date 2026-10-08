// Spielmodus: real grades stay fixed, open CP get assumed grades, the app
// shows the resulting average. No back-calculation (docs/ANFORDERUNGEN.md 4.4).
// Pure functions, unit-tested in spiel.test.ts.
import type { Belegung, Regeln, SpielZeile } from "../types";
import { OFFEN } from "../types";
import { berechneSchnitt, erreichteLeistungen, kategorieVon, type Leistung, type Schnitt } from "./noten";

let zaehler = 0;
export function neueId(): string {
  zaehler += 1;
  return `z${Date.now().toString(36)}${zaehler}`;
}

/** Rows for every open Belegung that is not in the list yet. */
export function ausPlan(belegungen: Belegung[], vorhanden: SpielZeile[]): SpielZeile[] {
  const schon = new Set(vorhanden.map((z) => z.belegungId).filter((x) => x != null));
  return belegungen
    .filter((b) => OFFEN.includes(b.status) && !schon.has(b.id))
    .map((b) => ({ id: neueId(), titel: b.titel, kategorie: b.kategorie, cp: b.cp, note100: null, quelle: "plan" as const, belegungId: b.id }));
}

const PLATZHALTER_TITEL: Record<string, string> = {
  G: "Grundlagen-Modul",
  K: "Mastermodul",
  A: "Angrenzendes Fach",
  F: "Flexibilisierung",
  HP: "Hochschulpraktikum",
  IE: "International Experience",
  UE: "Überfachliche Ergänzung",
  FP: "Forschungspraxis",
  MA: "Master's Thesis",
};

/**
 * Generic placeholders until every category reaches its target CP:
 * categories with a minimum are filled to it; the rest of a group (the 60 CP
 * Mastermodule) goes to the group's categories in order, respecting each
 * category's maximum. Already achieved CP and existing rows count.
 */
export function offeneCpAuffuellen(echte: Leistung[], zeilen: SpielZeile[], regeln: Regeln): SpielZeile[] {
  const ist = new Map<string, number>();
  for (const l of [...echte, ...zeilen]) ist.set(l.kategorie, (ist.get(l.kategorie) ?? 0) + l.cp);
  const neu: SpielZeile[] = [];

  const add = (kat: string, cp: number) => {
    if (cp <= 1e-9) return;
    const k = kategorieVon(regeln, kat);
    const block = regeln.platzhalterCp?.[kat] ?? 5;
    let rest = Math.round(cp * 10) / 10;
    while (rest > 1e-9) {
      const c = Math.min(block, rest);
      neu.push({
        id: neueId(),
        titel: `${PLATZHALTER_TITEL[kat] ?? k?.kurz ?? kat} (Platzhalter)`,
        kategorie: kat,
        cp: Math.round(c * 10) / 10,
        note100: null,
        quelle: "platzhalter",
      });
      rest = Math.round((rest - c) * 10) / 10;
    }
    ist.set(kat, (ist.get(kat) ?? 0) + cp);
  };

  // 1. category minimums
  for (const k of regeln.kategorien) {
    if (k.minCp != null) add(k.id, k.minCp - (ist.get(k.id) ?? 0));
  }
  // 2. group targets (e.g. Mastermodule 60 CP): prefer categories without a minimum, in order, up to their max
  for (const g of regeln.gruppen ?? []) {
    const kats = regeln.kategorien.filter((k) => k.gruppe === g.id);
    let fehlt = g.sollCp - kats.reduce((a, k) => a + (ist.get(k.id) ?? 0), 0);
    const reihenfolge = [...kats.filter((k) => k.minCp == null), ...kats.filter((k) => k.minCp != null)];
    for (const k of reihenfolge) {
      if (fehlt <= 1e-9) break;
      const platz = k.maxCp != null ? k.maxCp - (ist.get(k.id) ?? 0) : Infinity;
      const cp = Math.min(fehlt, Math.max(0, platz));
      add(k.id, cp);
      fehlt -= cp;
    }
  }
  return neu;
}

export interface SpielErgebnis extends Schnitt {
  echteCp: number;
  hypothetischeCp: number;
  /** Rows in graded categories that have no assumed grade yet. */
  ohneNote: number;
}

export function spielErgebnis(belegungen: Belegung[], zeilen: SpielZeile[], regeln: Regeln): SpielErgebnis {
  const echte = erreichteLeistungen(belegungen);
  const hypo: Leistung[] = zeilen.map((z) => ({ cp: z.cp, kategorie: z.kategorie, note100: z.note100 }));
  // Rows without an assumed grade still count for CP coverage but not for the average.
  const s = berechneSchnitt([...echte, ...hypo], regeln);
  const sumCp = (ls: { cp: number }[]) => Math.round(ls.reduce((a, l) => a + l.cp, 0) * 10) / 10;
  return {
    ...s,
    echteCp: sumCp(echte),
    hypothetischeCp: sumCp(hypo),
    ohneNote: zeilen.filter((z) => z.note100 == null && kategorieVon(regeln, z.kategorie)?.zaehltZurNote).length,
  };
}
