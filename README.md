# LearnFeed

A personal, single-user short-form feed for **educational** content — a
Shorts/TikTok-style vertical swipe feed of sub-60s videos across the topics you
care about, with a retention-quiz system fully built but **disabled by default**.

Sources are **TikTok-first with a YouTube fallback**, and the whole thing is
built to respect the YouTube Data API's stingy 10,000-units/day free tier.

## Stack
- **Frontend + backend:** Next.js (App Router) + React 19, API routes
- **DB:** SQLite via Node's built-in `node:sqlite` (no native build step)
- **Video sources:** unofficial TikTok scraper (Python `TikTokApi`) → YouTube Data API v3 fallback
- **Quiz (disabled):** Gemini API

## Setup
```bash
npm install
cp .env.example .env.local     # fill in YOUTUBE_API_KEY (GEMINI_API_KEY only needed for quiz)
npm run dev                     # http://localhost:3000
```

Optional — enable the TikTok source (otherwise everything falls back to YouTube):
```bash
pip install -r requirements.txt
python -m playwright install chromium
```

On first launch you'll pick interests; the app runs an initial prefetch so the
feed isn't empty.

## Quota management (the important bit)
- **Search costs 100 units/call**, so the feed **never** searches live on load.
- A background job (`npm run prefetch`, or `POST /api/prefetch`) pre-fetches
  ~25 videos per active interest into SQLite. The feed reads from that cache.
- The API is only hit when a topic's cache drops **below 5** unwatched videos.
- Every YouTube call is charged to a daily `quota_log`; calls that would exceed
  10k are refused, and prefetch skips itself when within 20% of the ceiling.
- The search bar hits YouTube live (min 3 chars, debounced) but caches each
  query for **24h**.

Schedule prefetch every few hours, e.g. cron:
```
0 */4 * * *  cd /path/to/learnfeed && npm run prefetch
```

## Video sources
- **Primary:** TikTok scraper (`scripts/tiktok_search.py`). Unofficial and
  fragile, so every call is wrapped in try/catch + a hard timeout.
- **Fallback:** any TikTok failure/timeout/rate-limit silently falls back to a
  YouTube search for the same topic.
- Each `videos` row stores a `source` (`tiktok` | `youtube`); the player embeds
  TikTok via its **oEmbed** endpoint and YouTube via the **IFrame Player API**.
- Reliability per source is tracked in `source_stats` (see Settings → Quota &
  sources).

## Feed UX
- Vertical snap scroll, autoplay, **muted by default** (tap to unmute).
- Videos mixed across active interests via weighted round-robin (priority rises
  on full watches, falls on skips).
- Next 1–2 videos are preloaded; far-off slides show a lazy thumbnail only.
- Broken/private/removed videos are skipped silently.

## Personalization
- Full watch (≥90%) = positive signal, skip <3s = negative.
- **3 skips in a row** on a topic deprioritizes it immediately (no waiting for
  session end).
- Watch time per topic is tracked; heavily-watched tags surface under
  **Settings → Suggested for you**.

## Quiz system (built, DISABLED)
Flip `QUIZ_ENABLED` on in **Settings** (or the `settings` table). When on:
- Every 5 min of watch time, at a **natural video end**, the feed pauses for one
  Gemini-generated multiple-choice question.
- Uses captions when available, else falls back to title + description.
- Questions are cached per video id (`quiz_cache`) so re-watches don't re-call Gemini.
- Correct **+15**, wrong **−15**. Tiers every 200 pts: Bronze → Silver → Gold →
  Platinum → Diamond. Difficulty scales with rank. (Rank starts at 1000.)

## Data model
`interests`, `videos`, `watch_events`, `quiz_cache`, `settings`, plus support
tables: `quota_log`, `source_stats`, `keyword_stats`, `skip_streaks`.
See `lib/db.js`.

## API routes
| Route | Purpose |
|-------|---------|
| `GET /api/feed` | rotation feed from local cache (triggers top-up when low) |
| `GET /api/search?q=` | live YouTube search, 24h cached |
| `POST /api/watch` | record watch/skip; returns quiz trigger |
| `GET/POST /api/interests`, `PATCH` | list/add/toggle interests |
| `GET/PATCH /api/settings` | settings, quota, source stats, rank |
| `GET /api/suggestions` | suggested topics |
| `POST /api/prefetch` | run the prefetch job (cron target) |
| `GET/POST /api/quiz` | question / answer (409 while disabled) |

Single-user, no auth, no leaderboard. API keys live in env vars.
