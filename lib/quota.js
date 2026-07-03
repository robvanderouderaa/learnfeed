import { getDb } from "./db.js";

// YouTube Data API v3 unit costs (the ones this app uses).
export const COST = {
  search: 100,
  videos: 1, // videos.list (details/contentDetails)
  captions: 50,
};

export function dailyLimit() {
  return Number(process.env.YOUTUBE_DAILY_QUOTA || 10000);
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export function quotaUsed(day = today()) {
  const row = getDb()
    .prepare("SELECT units_used FROM quota_log WHERE day = ?")
    .get(day);
  return row ? row.units_used : 0;
}

export function quotaRemaining() {
  return Math.max(0, dailyLimit() - quotaUsed());
}

// Would this call fit? Guards live YouTube calls so we never blow past 10k.
export function canSpend(units) {
  return quotaUsed() + units <= dailyLimit();
}

export function spendQuota(units) {
  const day = today();
  getDb()
    .prepare(
      "INSERT INTO quota_log (day, units_used) VALUES (?, ?) " +
        "ON CONFLICT(day) DO UPDATE SET units_used = units_used + excluded.units_used"
    )
    .run(day, units);
}

// True when we're within 20% of the ceiling — used to warn / skip prefetch.
export function quotaLow(threshold = 0.8) {
  return quotaUsed() >= dailyLimit() * threshold;
}

export function quotaStatus() {
  const used = quotaUsed();
  const limit = dailyLimit();
  return {
    day: today(),
    used,
    limit,
    remaining: Math.max(0, limit - used),
    low: used >= limit * 0.8,
  };
}
