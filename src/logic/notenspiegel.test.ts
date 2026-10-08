import { test } from "node:test";
import assert from "node:assert/strict";
import type { Modul, Notenspiegel } from "../types";
import { artVon, chronologisch, kennzahlen, neuesterHaupttermin, pruefeGegenTumonline, summiere } from "./notenspiegel";

// Invented numbers. The formulas were checked against real TUMonline exports
// (the published averages and fail rates came out exactly); real exam
// statistics are not committed to this public repo.
const ns = (termin: string, semester: string, verteilung: Record<string, number>, x: number, extra: Partial<Notenspiegel> = {}): Notenspiegel => ({
  termin,
  semester,
  verteilung,
  nichtErschienen: x,
  ...extra,
});

const A = ns("FA 24W", "WS 24/25", { "1.0": 2, "1.7": 2, "2.3": 4, "3.0": 2, "4.0": 2, "4.7": 1, "5.0": 7 }, 5);

test("key figures", () => {
  const k = kennzahlen(A);
  assert.equal(k.angetreten, 20);
  assert.equal(k.angemeldet, 25);
  assert.equal(k.bestanden, 12);
  assert.equal(k.durchgefallen, 8);
  // (2·1.0 + 2·1.7 + 4·2.3 + 2·3.0 + 2·4.0 + 4.7 + 7·5.0) / 20 = 68.3 / 20
  assert.ok(Math.abs(k.schnittGesamt! - 3.415) < 1e-12);
  // (2 + 3.4 + 9.2 + 6 + 8) / 12 = 28.6 / 12
  assert.ok(Math.abs(k.schnittBestanden! - 2.3833333) < 1e-6);
  assert.equal(k.durchfallquote, 0.4);
});

test("empty distribution", () => {
  const k = kennzahlen(ns("x", "SS 25", {}, 3));
  assert.equal(k.angetreten, 0);
  assert.equal(k.angemeldet, 3);
  assert.equal(k.schnittGesamt, null);
  assert.equal(k.durchfallquote, null);
});

test("check against the numbers read off TUMonline", () => {
  const gut = { ...A, angemeldet: 25, tumonline: { angetreten: 20, quoteNegativ: 0.4, schnittGesamt: 3.42, schnittBestanden: 2.38 } };
  assert.deepEqual(pruefeGegenTumonline(gut), []);
  const verlesen = { ...gut, tumonline: { ...gut.tumonline, schnittBestanden: 2.48, angetreten: 21 } };
  assert.deepEqual(
    pruefeGegenTumonline(verlesen).map((a) => a.feld),
    ["angetreten", "schnittBestanden"],
  );
});

test("pooling and order", () => {
  const B = ns("FA 25S", "SS 25", { "1.0": 1, "5.0": 1 }, 2);
  const s = summiere([A, B]);
  assert.equal(s.verteilung["1.0"], 3);
  assert.equal(s.verteilung["5.0"], 8);
  assert.equal(s.nichtErschienen, 7);
  const C = ns("FA 25W", "WS 25/26", { "2.0": 1 }, 0);
  assert.deepEqual(chronologisch([C, A, B]).map((x) => x.termin), ["FA 24W", "FA 25S", "FA 25W"]);
});

test("main/repeat exam and newest main exam", () => {
  const modul: Modul = {
    code: "XX1",
    titel: "x",
    cp: 5,
    kategorien: ["K"],
    turnus: "WS",
    notenspiegel: [
      ns("FA 24W", "WS 24/25", { "1.0": 1 }, 0),
      ns("FA 25S", "SS 25", { "2.0": 1 }, 0),
      ns("FA 25W", "WS 25/26", { "3.0": 1 }, 0),
      ns("FA 26S", "SS 26", { "4.0": 1 }, 0),
    ],
  };
  assert.equal(artVon(modul.notenspiegel![1], modul), "Wiederholung");
  assert.equal(artVon({ ...modul.notenspiegel![1], art: "Haupttermin" }, modul), "Haupttermin");
  assert.equal(neuesterHaupttermin(modul)?.termin, "FA 25W");
  assert.equal(neuesterHaupttermin({ ...modul, notenspiegel: [] }), null);
});
