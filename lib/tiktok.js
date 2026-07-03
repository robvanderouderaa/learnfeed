import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { recordSource } from "./sources.js";

// TikTok has no public search API. We shell out to an unofficial scraper
// (Python `TikTokApi`) via scripts/tiktok_search.py. This is inherently
// fragile — TikTok changes their site often — so EVERY call is wrapped in
// try/catch + a hard timeout, and any failure makes the caller fall back to
// YouTube for the same topic.

const PY = process.env.PYTHON_BIN || "python";
const SCRIPT = resolve(process.cwd(), "scripts", "tiktok_search.py");
const TIMEOUT_MS = Number(process.env.TIKTOK_TIMEOUT_MS || 15000);

function runScraper(query, max) {
  return new Promise((res, rej) => {
    let out = "";
    let err = "";
    let done = false;
    const child = spawn(PY, [SCRIPT, query, String(max)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      rej(new Error("tiktok scraper timed out"));
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      rej(e); // e.g. python not installed
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0) return rej(new Error(err.trim() || `exit ${code}`));
      try {
        res(JSON.parse(out || "[]"));
      } catch {
        rej(new Error("bad scraper output"));
      }
    });
  });
}

// Returns normalized rows on success. Throws on any failure so the caller
// can decide to fall back. Never let a TikTok failure surface to the user.
export async function searchTikTok(query, { max = 25, topicName = null } = {}) {
  try {
    const raw = await runScraper(query, max);
    const rows = (raw || [])
      .filter((v) => v && v.id && (v.duration == null || v.duration <= 180))
      .map((v) => ({
        id: `tt_${v.id}`,
        source: "tiktok",
        url: v.url || `https://www.tiktok.com/@${v.author || "u"}/video/${v.id}`,
        title: v.title || v.desc || "",
        description: v.desc || "",
        thumbnail_url: v.cover || v.thumbnail || "",
        duration_sec: v.duration || 0,
        topic_name: topicName || query,
        has_captions: 0, // scraper rarely exposes captions reliably
        tags: v.tags || [],
      }));
    recordSource("tiktok", true);
    return rows;
  } catch (err) {
    recordSource("tiktok", false, err.message);
    throw err;
  }
}
