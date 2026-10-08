// Thin wrappers around Tauri plugins with fallbacks for the browser.
import { isTauri } from "./api";

export const APP_VERSION: string = __APP_VERSION__;

export async function pickFolder(titel: string): Promise<string | null> {
  if (!isTauri) return window.prompt(`${titel}\n(Browser-Modus: „beispieldaten“ eingeben)`, "beispieldaten") || null;
  const d = await import("@tauri-apps/plugin-dialog");
  const r = await d.open({ directory: true, multiple: false, title: titel });
  return typeof r === "string" ? r : null;
}

export async function pickJsonFile(titel: string): Promise<string | null> {
  if (!isTauri) return null;
  const d = await import("@tauri-apps/plugin-dialog");
  const r = await d.open({ multiple: false, title: titel, filters: [{ name: "JSON", extensions: ["json"] }] });
  return typeof r === "string" ? r : null;
}

export async function bestaetigen(text: string, titel = "MW Master"): Promise<boolean> {
  if (!isTauri) return window.confirm(text);
  const d = await import("@tauri-apps/plugin-dialog");
  return d.confirm(text, { title: titel, kind: "warning", okLabel: "Ja", cancelLabel: "Abbrechen" });
}

export async function openUrl(url: string) {
  if (!isTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const o = await import("@tauri-apps/plugin-opener");
  await o.openUrl(url);
}

export async function openFolder(path: string) {
  if (!isTauri) return;
  try {
    const o = await import("@tauri-apps/plugin-opener");
    await o.openPath(path);
  } catch {
    /* ignore */
  }
}

// ---------------- updates (GitHub Releases via tauri-plugin-updater) ----------------

export interface UpdateInfo {
  version: string;
  notes?: string;
  install: () => Promise<void>;
}

/**
 * Check GitHub for a newer release. Returns null when up to date. Throws with
 * a readable message when updates are not set up yet (see CLAUDE.md, "Releases").
 */
export async function suchenNachUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri) throw new Error("Updates gibt es nur in der Desktop-App.");
  const u = await import("@tauri-apps/plugin-updater");
  let update;
  try {
    update = await u.check();
  } catch (e) {
    throw new Error(`Update-Prüfung fehlgeschlagen: ${String(e)}`);
  }
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? undefined,
    install: async () => {
      await update.downloadAndInstall();
      const p = await import("@tauri-apps/plugin-process");
      await p.relaunch();
    },
  };
}
