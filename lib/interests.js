import { getDb } from "./db.js";

// Map an interest name to the YouTube/TikTok search query used to fetch it.
// Short-form intent is baked in so results skew to Shorts/Reels-style clips.
const QUERY_MAP = {
  psychology: "psychology facts shorts",
  tech: "tech explained shorts",
  science: "science facts shorts",
  "self-improvement": "self improvement tips shorts",
  history: "history facts shorts",
};

export function queryForInterest(name) {
  const key = name.toLowerCase().trim();
  return QUERY_MAP[key] || `${name} facts shorts`;
}

export function listInterests({ activeOnly = false } = {}) {
  const sql = activeOnly
    ? "SELECT * FROM interests WHERE active = 1 ORDER BY priority DESC, id"
    : "SELECT * FROM interests ORDER BY id";
  return getDb().prepare(sql).all();
}

export function addInterest(name) {
  const clean = name.trim();
  if (!clean) throw new Error("empty interest");
  getDb()
    .prepare("INSERT OR IGNORE INTO interests (name, active) VALUES (?, 1)")
    .run(clean);
  return getDb().prepare("SELECT * FROM interests WHERE name = ?").get(clean);
}

export function setActive(id, active) {
  getDb()
    .prepare("UPDATE interests SET active = ? WHERE id = ?")
    .run(active ? 1 : 0, id);
}

export function adjustPriority(id, delta, { min = 0.1, max = 3.0 } = {}) {
  getDb()
    .prepare(
      "UPDATE interests SET priority = MAX(?, MIN(?, priority + ?)) WHERE id = ?"
    )
    .run(min, max, delta, id);
}
