// Standalone prefetch runner for cron: `npm run prefetch`.
// Loads .env.local so it can hit the YouTube API outside of Next.
import { runPrefetch } from "../lib/prefetch.js";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  /* no .env.local — rely on ambient env */
}

const force = process.argv.includes("--force");
const result = await runPrefetch({ force });
console.log(JSON.stringify(result, null, 2));
