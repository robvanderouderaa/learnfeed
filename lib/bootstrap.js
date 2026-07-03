import { listInterests, addInterest } from "./interests.js";
import { unwatchedCount, upsertVideos } from "./videos.js";
import { setSetting, getSetting } from "./settings.js";
import { DEMO_MODE, demoVideos } from "./demo.js";

const DEFAULT_INTERESTS = ["psychology", "science", "tech", "self-improvement", "history"];
const LOW_WATERMARK = 5;

// Make the app work with zero setup: on first run, seed default interests,
// mark the user onboarded, and (in demo mode) fill the cache with playable
// sample clips. Idempotent — safe to call on every feed load.
export function ensureSeed() {
  let interests = listInterests();
  if (interests.length === 0) {
    for (const name of DEFAULT_INTERESTS) addInterest(name);
    setSetting("ONBOARDED", "true"); // skip onboarding — nothing for the user to do
    interests = listInterests();
  }

  // Only auto-fill videos in demo mode; with a real API key the prefetch job
  // owns the cache and we don't want to pollute it with samples.
  if (DEMO_MODE) {
    for (const it of interests.filter((i) => i.active)) {
      if (unwatchedCount(it.id) < LOW_WATERMARK) {
        upsertVideos(demoVideos(it.name, { max: 20 }), { topicId: it.id });
      }
    }
  }

  return { demo: DEMO_MODE, onboarded: getSetting("ONBOARDED") === "true" };
}
