// Manually zero today's YouTube quota ledger (e.g. after a Google reset).
import { getDb } from "../lib/db.js";

try {
  process.loadEnvFile?.(".env.local");
} catch {}

const day = new Date().toISOString().slice(0, 10);
getDb().prepare("DELETE FROM quota_log WHERE day = ?").run(day);
console.log(`Cleared quota for ${day}`);
