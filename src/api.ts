// Backend abstraction. In Tauri, calls go to Rust/SQLite. In a plain browser
// (`npm run dev`, UI work and screenshots) a localStorage fake is used and
// the shared folder is the invented sample data in examples/shared.
import type { Belegung, SharedRead } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface Backend {
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  belegungenList(): Promise<Belegung[]>;
  belegungUpsert(b: Belegung): Promise<Belegung>;
  belegungDelete(id: number): Promise<void>;
  /** Content of manifest.json in the shared folder (cheap change check). */
  sharedManifest(path: string): Promise<string>;
  /** All files of the shared folder, raw. Never writes. */
  sharedRead(path: string): Promise<SharedRead>;
  /** Write the private backup into `dir`; returns the file path. */
  backupWrite(dir: string): Promise<string>;
  /** Replace private data with a backup/import file; returns the number of Belegungen. */
  backupRestore(path: string): Promise<number>;
  dataDir(): Promise<string>;
}

async function tauriBackend(): Promise<Backend> {
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    kvGet: (key) => invoke("kv_get", { key }),
    kvSet: (key, value) => invoke("kv_set", { key, value }),
    belegungenList: () => invoke("belegungen_list"),
    belegungUpsert: (belegung) => invoke("belegung_upsert", { belegung }),
    belegungDelete: (id) => invoke("belegung_delete", { id }),
    sharedManifest: (path) => invoke("shared_manifest", { path }),
    sharedRead: (path) => invoke("shared_read", { path }),
    backupWrite: (dir) => invoke("backup_write", { dir }),
    backupRestore: (path) => invoke("backup_restore", { path }),
    dataDir: () => invoke("data_dir"),
  };
}

// ---------------- browser fake ----------------

/** Path that the browser fake treats as "the shared folder". */
export const BEISPIEL_PFAD = "beispieldaten";

// Lazy: the sample data is only loaded in browser mode, never bundled into the app's main chunk.
const beispiel = import.meta.glob("../examples/shared/**/*.json", { query: "?raw", import: "default" });

async function beispielRead(): Promise<SharedRead> {
  const files: SharedRead["files"] = [];
  for (const [p, load] of Object.entries(beispiel)) {
    const name = p.replace("../examples/shared/", "");
    files.push({ name, content: (await load()) as string });
  }
  const order = (n: string) => (n === "manifest.json" ? 0 : n === "regeln.json" ? 1 : n === "tags.json" ? 2 : 3);
  files.sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name));
  return { root: BEISPIEL_PFAD, files, errors: [] };
}

function browserBackend(): Backend {
  const P = "mwm:";
  const ls = {
    get: (k: string) => {
      try {
        return localStorage.getItem(P + k);
      } catch {
        return null;
      }
    },
    set: (k: string, v: string) => {
      try {
        localStorage.setItem(P + k, v);
      } catch {
        /* ignore (private window) */
      }
    },
  };
  const load = (): Belegung[] => JSON.parse(ls.get("belegungen") ?? "[]");
  const save = (all: Belegung[]) => ls.set("belegungen", JSON.stringify(all));
  const notFound = (path: string) => new Error(`Im Browser-Modus gibt es nur den Ordner „${BEISPIEL_PFAD}“ (gewählt: ${path}).`);

  return {
    kvGet: async (key) => ls.get("kv:" + key),
    kvSet: async (key, value) => ls.set("kv:" + key, value),
    belegungenList: async () => load().sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    belegungUpsert: async (b) => {
      const all = load();
      const now = Date.now();
      if (b.id === 0) {
        const id = all.reduce((m, x) => Math.max(m, x.id), 0) + 1;
        const sortOrder = b.sortOrder || all.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1;
        const nb = { ...b, id, sortOrder, createdAt: now, updatedAt: now };
        save([...all, nb]);
        return nb;
      }
      const nb = { ...b, updatedAt: now };
      save(all.map((x) => (x.id === b.id ? nb : x)));
      return nb;
    },
    belegungDelete: async (id) => save(load().filter((x) => x.id !== id)),
    sharedManifest: async (path) => {
      if (path !== BEISPIEL_PFAD) throw notFound(path);
      return (await beispielRead()).files.find((f) => f.name === "manifest.json")!.content;
    },
    sharedRead: async (path) => {
      if (path !== BEISPIEL_PFAD) throw notFound(path);
      return beispielRead();
    },
    backupWrite: async () => {
      ls.set("backup", JSON.stringify({ version: 1, belegungen: load() }));
      return "localStorage (Browser-Modus)";
    },
    backupRestore: async () => {
      throw new Error("Wiederherstellen geht nur in der Desktop-App.");
    },
    dataDir: async () => "localStorage (Browser-Modus)",
  };
}

let backendPromise: Promise<Backend> | null = null;
export function backend(): Promise<Backend> {
  if (!backendPromise) backendPromise = isTauri ? tauriBackend() : Promise.resolve(browserBackend());
  return backendPromise;
}
