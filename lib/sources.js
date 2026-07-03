import { getDb } from "./db.js";

// Track how reliable each video source stays over time.
export function recordSource(source, ok, errMsg = null) {
  const db = getDb();
  db.prepare(
    `INSERT INTO source_stats (source, success, failure, last_ok, last_err)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       success = success + excluded.success,
       failure = failure + excluded.failure,
       last_ok = COALESCE(excluded.last_ok, source_stats.last_ok),
       last_err = COALESCE(excluded.last_err, source_stats.last_err)`
  ).run(
    source,
    ok ? 1 : 0,
    ok ? 0 : 1,
    ok ? new Date().toISOString() : null,
    ok ? null : errMsg
  );
}

export function sourceStats() {
  const rows = getDb().prepare("SELECT * FROM source_stats").all();
  return rows.map((r) => {
    const total = r.success + r.failure;
    return {
      source: r.source,
      success: r.success,
      failure: r.failure,
      total,
      success_rate: total ? +(r.success / total).toFixed(3) : null,
      last_ok: r.last_ok,
      last_err: r.last_err,
    };
  });
}
