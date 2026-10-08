import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareSemester,
  fachsemester,
  formatSemester,
  parseSemester,
  passtZumTurnus,
  semesterAt,
  semesterFromTermin,
  semesterRange,
  terminArt,
} from "./semester";

test("parse and format semesters", () => {
  assert.deepEqual(parseSemester("WS 26/27"), { art: "WS", jahr: 2026 });
  assert.deepEqual(parseSemester("ss 27"), { art: "SS", jahr: 2027 });
  assert.deepEqual(parseSemester("WS 99/00"), { art: "WS", jahr: 2099 });
  assert.equal(parseSemester("WS 26/28"), null);
  assert.equal(parseSemester("vor"), null);
  assert.equal(formatSemester({ art: "WS", jahr: 2026 }), "WS 26/27");
  assert.equal(formatSemester({ art: "SS", jahr: 2027 }), "SS 27");
});

test("semester order and ranges", () => {
  assert.deepEqual(semesterRange("WS 26/27", 4), ["WS 26/27", "SS 27", "WS 27/28", "SS 28"]);
  assert.deepEqual(semesterRange("SS 27", 2), ["SS 27", "WS 27/28"]);
  const sorted = ["ohne", "SS 27", "WS 26/27", "vor", "WS 25/26"].sort(compareSemester);
  assert.deepEqual(sorted, ["vor", "WS 25/26", "WS 26/27", "SS 27", "ohne"]);
});

test("semester of a date and Fachsemester", () => {
  assert.deepEqual(semesterAt(new Date(2026, 9, 7)), { art: "WS", jahr: 2026 });
  assert.deepEqual(semesterAt(new Date(2027, 1, 15)), { art: "WS", jahr: 2026 });
  assert.deepEqual(semesterAt(new Date(2027, 3, 1)), { art: "SS", jahr: 2027 });
  assert.equal(fachsemester("WS 26/27", { art: "WS", jahr: 2026 }), 1);
  assert.equal(fachsemester("WS 26/27", { art: "SS", jahr: 2027 }), 2);
  assert.equal(fachsemester("WS 26/27", { art: "WS", jahr: 2027 }), 3);
});

test("semester from exam label", () => {
  assert.equal(semesterFromTermin("FA 24W"), "WS 24/25");
  assert.equal(semesterFromTermin("25S"), "SS 25");
  assert.equal(semesterFromTermin("MW1234 FA 25 W"), "WS 25/26");
  assert.equal(semesterFromTermin("Klausur"), null);
});

test("main or repeat exam from Turnus", () => {
  assert.equal(terminArt("WS", "WS 24/25"), "Haupttermin");
  assert.equal(terminArt("WS", "SS 25"), "Wiederholung");
  assert.equal(terminArt("SS", "SS 25"), "Haupttermin");
  assert.equal(terminArt("SS", "WS 25/26"), "Wiederholung");
  assert.equal(terminArt("WS+SS", "SS 25"), "Haupttermin");
  assert.equal(terminArt("unregelmaessig", "SS 25"), "unbekannt");
  assert.equal(passtZumTurnus("SS", "WS 26/27"), false);
  assert.equal(passtZumTurnus("SS", "SS 27"), true);
  assert.equal(passtZumTurnus("WS", "ohne"), true);
});
