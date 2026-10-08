import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SharedRead } from "../types";
import { manifestGeaendert, pruefe, verarbeite } from "./shared";

const EX = join(import.meta.dirname, "../../examples/shared");
const JETZT = "2026-10-07T20:00:00.000Z";

function readExamples(): SharedRead {
  const files = ["manifest.json", "regeln.json", "tags.json"].map((name) => ({
    name,
    content: readFileSync(join(EX, name), "utf-8"),
  }));
  for (const f of readdirSync(join(EX, "module")).sort()) {
    files.push({ name: `module/${f}`, content: readFileSync(join(EX, "module", f), "utf-8") });
  }
  return { root: EX, files, errors: [] };
}

const replace = (read: SharedRead, name: string, content: string): SharedRead => ({
  ...read,
  files: read.files.map((f) => (f.name === name ? { ...f, content } : f)),
});

test("example data validates against the schemas", () => {
  const r = verarbeite(readExamples(), null, JETZT);
  assert.equal(r.fehler, null);
  assert.deepEqual(r.warnungen, []);
  assert.equal(r.daten!.module.length, 8);
  assert.equal(r.daten!.manifest.anzahlModule, 8);
  assert.equal(r.daten!.gelesenAm, JETZT);
  assert.equal(r.geaendert, true);
});

test("schema errors are readable", () => {
  const res = pruefe("modul", JSON.stringify({ code: "X1", titel: "x", cp: -1, kategorien: [], turnus: "Winter" }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.fehler, /cp|kategorien|turnus/);
  const bad = pruefe("modul", "{ nope");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.fehler, /kein gültiges JSON/);
});

test("a broken module file keeps the cached version", () => {
  const first = verarbeite(readExamples(), null, JETZT).daten!;
  const broken = replace(readExamples(), "module/XX0001.json", "{ half written");
  const r = verarbeite(broken, first, JETZT);
  assert.equal(r.fehler, null);
  assert.equal(r.daten!.module.length, 8);
  assert.equal(r.warnungen.length, 1);
  assert.match(r.warnungen[0], /XX0001.*alte Version/);
  assert.equal(r.geaendert, false);
});

test("an unreadable (cloud-only) module keeps the cached version; removed files disappear", () => {
  const first = verarbeite(readExamples(), null, JETZT).daten!;
  const read = readExamples();
  const ohne = {
    ...read,
    files: read.files.filter((f) => f.name !== "module/XX0002.json" && f.name !== "module/XX0003.json"),
    errors: [{ name: "module/XX0002.json", error: "Zugriff verweigert" }],
  };
  const r = verarbeite(ohne, first, JETZT);
  const codes = r.daten!.module.map((m) => m.code);
  assert.ok(codes.includes("XX0002"), "kept from cache");
  assert.ok(!codes.includes("XX0003"), "deleted in the shared folder");
  assert.equal(r.daten!.module.length, 7);
  assert.equal(r.geaendert, true);
});

test("invalid manifest or newer major version keeps everything", () => {
  const first = verarbeite(readExamples(), null, JETZT).daten!;
  const r1 = verarbeite(replace(readExamples(), "manifest.json", "{}"), first, JETZT);
  assert.match(r1.fehler!, /manifest.json ungültig/);
  assert.equal(r1.daten, first);
  const newer = JSON.parse(readFileSync(join(EX, "manifest.json"), "utf-8"));
  newer.schemaVersion = "2.0";
  const r2 = verarbeite(replace(readExamples(), "manifest.json", JSON.stringify(newer)), first, JETZT);
  assert.match(r2.fehler!, /Bitte App aktualisieren/);
  assert.equal(r2.daten, first);
  // Without a cache there is nothing to fall back to.
  assert.equal(verarbeite(replace(readExamples(), "manifest.json", "{}"), null, JETZT).daten, null);
});

test("broken rules fall back to the cache, or fail without one", () => {
  const first = verarbeite(readExamples(), null, JETZT).daten!;
  const read = replace(readExamples(), "regeln.json", "{\"gesamtCp\": 120}");
  const r = verarbeite(read, first, JETZT);
  assert.equal(r.fehler, null);
  assert.equal(r.daten!.regeln, first.regeln);
  assert.match(r.warnungen[0], /regeln.json/);
  assert.match(verarbeite(read, null, JETZT).fehler!, /regeln.json/);
});

test("warnings for wrong file names, unknown tags and categories", () => {
  const read = readExamples();
  const m = JSON.parse(read.files.find((f) => f.name === "module/XX0001.json")!.content);
  m.code = "XX9999";
  m.tags = ["gibtsnicht"];
  m.kategorien = ["Q"];
  const r = verarbeite(replace(read, "module/XX0001.json", JSON.stringify(m)), null, JETZT);
  assert.equal(r.warnungen.length, 3);
  assert.match(r.warnungen.join("\n"), /Dateiname/);
  assert.match(r.warnungen.join("\n"), /gibtsnicht/);
  assert.match(r.warnungen.join("\n"), /unbekannte Kategorie Q/);
});

test("manifest change detection", () => {
  const first = verarbeite(readExamples(), null, JETZT).daten!;
  const mf = readFileSync(join(EX, "manifest.json"), "utf-8");
  assert.equal(manifestGeaendert(mf, first), false);
  assert.equal(manifestGeaendert(mf.replace("2026-10-07T18:00:00", "2026-10-08T09:00:00"), first), true);
  assert.equal(manifestGeaendert(mf, null), true);
});
