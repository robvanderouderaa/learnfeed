import { listInterests, addInterest } from "./interests.js";
import { setSetting, getSetting } from "./settings.js";

const DEFAULT_INTERESTS = ["psychology", "science", "tech", "self-improvement", "history"];

// Zero-setup first run: seed default interests and mark the user onboarded so
// they land straight on a working feed. Content is populated by the prefetch
// job (TikTok → YouTube → demo fallback), NOT here — so real sources are used
// even when no API keys are configured. Idempotent.
export function ensureSeed() {
  let interests = listInterests();
  if (interests.length === 0) {
    for (const name of DEFAULT_INTERESTS) addInterest(name);
    setSetting("ONBOARDED", "true");
    interests = listInterests();
  }
  return { onboarded: getSetting("ONBOARDED") === "true", interests: interests.length };
}
