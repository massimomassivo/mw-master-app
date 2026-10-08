use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, DbError>;

/// One module the user plans, takes or has passed. Grades and the semester
/// plan are the same records: a planned module becomes a grade once it is
/// passed (see docs/ANFORDERUNGEN.md, 4.1).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Belegung {
    #[serde(default)]
    pub id: i64,
    /// Module code from the shared catalog, or None for a free entry
    /// (e.g. a course recognised from abroad).
    pub modul_code: Option<String>,
    pub titel: String,
    pub cp: f64,
    /// Category id from regeln.json, e.g. "G", "K", "HP".
    pub kategorie: String,
    /// Sub-area id, only for categories that have them (e.g. "UE-ETHIK").
    #[serde(default)]
    pub unterbereich: Option<String>,
    /// "WS 26/27", "SS 27", "vor" (before the master) or "ohne" (no term yet).
    pub semester: String,
    /// idee | geplant | angemeldet | bestanden | anerkannt | nicht_bestanden
    pub status: String,
    /// Grade in hundredths (1,3 -> 130). None = no grade (planned, or passed
    /// without a grade).
    #[serde(default)]
    pub note100: Option<i64>,
    #[serde(default)]
    pub notiz: String,
    #[serde(default)]
    pub sort_order: i64,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Schema version of this snapshot; see SCHEMA_VERSION.
    #[serde(default)]
    pub version: i64,
    #[serde(default)]
    pub belegungen: Vec<Belegung>,
    /// Key/value settings and state (settings, Spielmodus, private notes).
    /// Keys starting with CACHE_PREFIX are not included.
    #[serde(default)]
    pub kv: Vec<(String, String)>,
}

pub struct Db {
    conn: Connection,
}

/// Schema version written into snapshots. When the stored shape changes, bump
/// it and upgrade older snapshots in `upgrade_snapshot` instead of relying on
/// serde defaults, which drop unknown fields silently.
pub const SCHEMA_VERSION: i64 = 1;

/// kv keys with this prefix hold data that can be rebuilt (the cache of the
/// shared folder). They are left out of backups and survive a restore.
pub const CACHE_PREFIX: &str = "cache:";

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS belegungen (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    modul_code   TEXT,
    titel        TEXT NOT NULL,
    cp           REAL NOT NULL,
    kategorie    TEXT NOT NULL,
    unterbereich TEXT,
    semester     TEXT NOT NULL,
    status       TEXT NOT NULL,
    note100      INTEGER,
    notiz        TEXT NOT NULL DEFAULT '',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL DEFAULT 0,
    updated_at   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_belegungen_semester ON belegungen(semester);
"#;

/// Schema migrations go here. Detect the old shape from the actual columns
/// (see the Pomodoro app for the pattern) and alter the tables in place.
fn migrate(_conn: &Connection) -> Result<()> {
    Ok(())
}

fn upgrade_snapshot(mut snap: Snapshot) -> Snapshot {
    // Version 1 is the first one; nothing to upgrade yet.
    snap.version = SCHEMA_VERSION;
    snap
}

impl Db {
    pub fn open(path: &Path) -> Result<Db> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        Self::init(Connection::open(path)?)
    }

    pub fn open_in_memory() -> Result<Db> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Db> {
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        conn.execute_batch(SCHEMA)?;
        migrate(&conn)?;
        Ok(Db { conn })
    }

    // ---------------- kv ----------------

    pub fn get_kv(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT value FROM kv WHERE key = ?1", params![key], |r| r.get(0))
            .optional()?)
    }

    pub fn set_kv(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO kv(key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn delete_kv(&self, key: &str) -> Result<()> {
        self.conn.execute("DELETE FROM kv WHERE key = ?1", params![key])?;
        Ok(())
    }

    // ---------------- belegungen ----------------

    fn row_belegung(r: &Row) -> rusqlite::Result<Belegung> {
        Ok(Belegung {
            id: r.get(0)?,
            modul_code: r.get(1)?,
            titel: r.get(2)?,
            cp: r.get(3)?,
            kategorie: r.get(4)?,
            unterbereich: r.get(5)?,
            semester: r.get(6)?,
            status: r.get(7)?,
            note100: r.get(8)?,
            notiz: r.get(9)?,
            sort_order: r.get(10)?,
            created_at: r.get(11)?,
            updated_at: r.get(12)?,
        })
    }

    pub fn list_belegungen(&self) -> Result<Vec<Belegung>> {
        let mut st = self.conn.prepare(
            "SELECT id, modul_code, titel, cp, kategorie, unterbereich, semester, status,
                    note100, notiz, sort_order, created_at, updated_at
             FROM belegungen ORDER BY sort_order, id",
        )?;
        let rows = st.query_map([], Self::row_belegung)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Insert (id == 0) or update a record. Returns the stored record.
    pub fn upsert_belegung(&self, b: &Belegung, now_ms: i64) -> Result<Belegung> {
        let mut out = b.clone();
        out.updated_at = now_ms;
        if b.id == 0 {
            out.created_at = now_ms;
            if out.sort_order == 0 {
                out.sort_order = self.conn.query_row(
                    "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM belegungen",
                    [],
                    |r| r.get(0),
                )?;
            }
            self.conn.execute(
                "INSERT INTO belegungen(modul_code, titel, cp, kategorie, unterbereich, semester,
                     status, note100, notiz, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    out.modul_code,
                    out.titel,
                    out.cp,
                    out.kategorie,
                    out.unterbereich,
                    out.semester,
                    out.status,
                    out.note100,
                    out.notiz,
                    out.sort_order,
                    out.created_at,
                    out.updated_at
                ],
            )?;
            out.id = self.conn.last_insert_rowid();
        } else {
            self.conn.execute(
                "UPDATE belegungen SET modul_code = ?2, titel = ?3, cp = ?4, kategorie = ?5,
                     unterbereich = ?6, semester = ?7, status = ?8, note100 = ?9, notiz = ?10,
                     sort_order = ?11, updated_at = ?12
                 WHERE id = ?1",
                params![
                    out.id,
                    out.modul_code,
                    out.titel,
                    out.cp,
                    out.kategorie,
                    out.unterbereich,
                    out.semester,
                    out.status,
                    out.note100,
                    out.notiz,
                    out.sort_order,
                    out.updated_at
                ],
            )?;
        }
        Ok(out)
    }

    pub fn delete_belegung(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM belegungen WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ---------------- snapshot / restore ----------------

    /// Everything private except the rebuildable cache.
    pub fn snapshot(&self) -> Result<Snapshot> {
        let mut st = self
            .conn
            .prepare("SELECT key, value FROM kv WHERE key NOT LIKE ?1 ORDER BY key")?;
        let kv = st
            .query_map(params![format!("{CACHE_PREFIX}%")], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<Vec<(String, String)>>>()?;
        Ok(Snapshot {
            version: SCHEMA_VERSION,
            belegungen: self.list_belegungen()?,
            kv,
        })
    }

    /// Replace all private data with the snapshot. Cache entries stay.
    pub fn restore(&mut self, snap: &Snapshot) -> Result<()> {
        let snap = upgrade_snapshot(snap.clone());
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM belegungen", [])?;
        tx.execute("DELETE FROM kv WHERE key NOT LIKE ?1", params![format!("{CACHE_PREFIX}%")])?;
        for b in &snap.belegungen {
            tx.execute(
                "INSERT INTO belegungen(id, modul_code, titel, cp, kategorie, unterbereich, semester,
                     status, note100, notiz, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    if b.id > 0 { Some(b.id) } else { None },
                    b.modul_code,
                    b.titel,
                    b.cp,
                    b.kategorie,
                    b.unterbereich,
                    b.semester,
                    b.status,
                    b.note100,
                    b.notiz,
                    b.sort_order,
                    b.created_at,
                    b.updated_at
                ],
            )?;
        }
        for (k, v) in &snap.kv {
            if k.starts_with(CACHE_PREFIX) {
                continue;
            }
            tx.execute(
                "INSERT INTO kv(key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![k, v],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(code: Option<&str>, note: Option<i64>) -> Belegung {
        Belegung {
            id: 0,
            modul_code: code.map(String::from),
            titel: "Beispielmodul".into(),
            cp: 5.0,
            kategorie: "K".into(),
            unterbereich: None,
            semester: "WS 26/27".into(),
            status: if note.is_some() { "bestanden".into() } else { "geplant".into() },
            note100: note,
            notiz: String::new(),
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn insert_update_delete() {
        let db = Db::open_in_memory().unwrap();
        let a = db.upsert_belegung(&sample(Some("XX0001"), Some(130)), 10).unwrap();
        let b = db.upsert_belegung(&sample(None, None), 11).unwrap();
        assert!(a.id > 0 && b.id > a.id);
        assert_eq!(a.created_at, 10);
        assert!(b.sort_order > a.sort_order);

        let mut changed = a.clone();
        changed.note100 = Some(170);
        db.upsert_belegung(&changed, 20).unwrap();
        let all = db.list_belegungen().unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].note100, Some(170));
        assert_eq!(all[0].created_at, 10);
        assert_eq!(all[0].updated_at, 20);

        db.delete_belegung(b.id).unwrap();
        assert_eq!(db.list_belegungen().unwrap().len(), 1);
    }

    #[test]
    fn snapshot_roundtrip_keeps_cache_local() {
        let mut db = Db::open_in_memory().unwrap();
        db.upsert_belegung(&sample(Some("XX0001"), Some(100)), 1).unwrap();
        db.set_kv("settings", "{\"a\":1}").unwrap();
        db.set_kv("cache:shared", "{\"big\":true}").unwrap();

        let snap = db.snapshot().unwrap();
        assert_eq!(snap.version, SCHEMA_VERSION);
        assert_eq!(snap.belegungen.len(), 1);
        assert_eq!(snap.kv, vec![("settings".to_string(), "{\"a\":1}".to_string())]);

        // JSON roundtrip as written to the backup file.
        let json = serde_json::to_string(&snap).unwrap();
        let back: Snapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(back, snap);

        // Restore into a db with other content: private data replaced, cache kept.
        db.upsert_belegung(&sample(None, None), 2).unwrap();
        db.set_kv("settings", "{\"a\":2}").unwrap();
        db.restore(&back).unwrap();
        assert_eq!(db.list_belegungen().unwrap().len(), 1);
        assert_eq!(db.get_kv("settings").unwrap().as_deref(), Some("{\"a\":1}"));
        assert_eq!(db.get_kv("cache:shared").unwrap().as_deref(), Some("{\"big\":true}"));
    }

    #[test]
    fn restore_accepts_minimal_import_file() {
        // An import file prepared by hand or by Claude may omit ids and timestamps.
        let json = r#"{
            "version": 1,
            "belegungen": [
                { "modulCode": null, "titel": "CFD-Kurs (Erasmus)", "cp": 5, "kategorie": "F",
                  "semester": "vor", "status": "anerkannt", "note100": 150 }
            ]
        }"#;
        let snap: Snapshot = serde_json::from_str(json).unwrap();
        let mut db = Db::open_in_memory().unwrap();
        db.restore(&snap).unwrap();
        let all = db.list_belegungen().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].note100, Some(150));
        assert!(all[0].id > 0);
    }

    #[test]
    fn data_survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub").join("mwmaster.db");
        {
            let db = Db::open(&path).unwrap();
            db.upsert_belegung(&sample(Some("XX0001"), Some(100)), 1).unwrap();
        }
        let db = Db::open(&path).unwrap();
        assert_eq!(db.list_belegungen().unwrap().len(), 1);
    }
}
