//! Writing and reading backup files (JSON snapshots of the private data).

use crate::db::{Result, Snapshot};
use std::path::{Path, PathBuf};

pub const BACKUP_FILE: &str = "mw-master-backup.json";

/// Write `bytes` to `path` via a temp file, so a crash or a sync client never
/// sees a half-written file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Write the snapshot as `mw-master-backup.json` into `dir`. Returns the path.
pub fn write_backup(dir: &Path, snap: &Snapshot) -> Result<PathBuf> {
    let path = dir.join(BACKUP_FILE);
    let json = serde_json::to_vec_pretty(snap)?;
    write_atomic(&path, &json)?;
    Ok(path)
}

pub fn read_backup(path: &Path) -> Result<Snapshot> {
    let bytes = std::fs::read(path)?;
    Ok(serde_json::from_slice(&bytes)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    #[test]
    fn write_and_read() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open_in_memory().unwrap();
        db.set_kv("settings", "{}").unwrap();
        let snap = db.snapshot().unwrap();
        let path = write_backup(&dir.path().join("nested"), &snap).unwrap();
        assert!(path.ends_with(BACKUP_FILE));
        assert_eq!(read_backup(&path).unwrap(), snap);
        assert!(!path.with_extension("tmp").exists());
    }
}
