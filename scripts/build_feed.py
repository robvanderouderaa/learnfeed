#!/usr/bin/env python3
"""Scrape real TikTok videos per interest and bake them into docs/feed.json.

The live site is static (GitHub Pages) so it can't run the scraper at request
time. This runs the SAME unofficial TikTok scraper the Node app uses, once per
interest, in a single browser session, and writes the results the static feed
reads. Re-run + redeploy to refresh content.

Usage: python scripts/build_feed.py
"""
import asyncio
import json
import os
import sys

# interest -> TikTok search query (mirrors lib/interests.js)
INTERESTS = {
    "psychology": "psychology explained",
    "science": "science explained",
    "tech": "how technology works",
    "self-improvement": "productivity advice",
    "history": "history documentary short",
}
PER_TOPIC = 18
SEARCH_COUNT = 90          # over-fetch, filtering throws a lot away
MIN_LIKES = 1000           # user requirement: no low-engagement clips
MAX_DURATION = 180         # short-form-ish; real educational clips run 1-3 min
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "feed.json")

# Known low-effort / AI-slop faceless-channel author markers.
SLOP_AUTHOR = ("motivat", "_facts", "facts_", "factss", "abstract_",
               "aivoice", "ai_", "_ai", "dailywisdom", "wisdom_",
               "deepthought", "mindsetmotiv", "quotes_", "factoverload")
SLOP_DESC = ("ai voice", "#ai ", "chatgpt", "ai generated", "#aivoice",
             "text to speech", "generated with ai", "made with ai")


def likes_of(d):
    stats = d.get("stats") or {}
    try:
        return int(stats.get("diggCount") or 0)
    except (TypeError, ValueError):
        return 0


def is_slop(d, author, desc):
    # 1. TikTok's own AI-generated-content label
    if (d.get("AIGCDescription") or "").strip():
        return True
    # 2. ads
    if d.get("isAd"):
        return True
    # 3. faceless slop channels
    a = author.lower()
    if any(s in a for s in SLOP_AUTHOR):
        return True
    # 4. explicit AI markers in the caption
    dl = desc.lower()
    if any(s in dl for s in SLOP_DESC):
        return True
    return False


def shape(topic, d):
    vid = d.get("video", {}) or {}
    author = (d.get("author", {}) or {}).get("uniqueId", "u")
    return {
        "id": d.get("id"),
        "source": "tiktok",
        "topic": topic,
        "url": f"https://www.tiktok.com/@{author}/video/{d.get('id')}",
        "title": d.get("desc", ""),
        "author": author,
        "likes": likes_of(d),
        "cover": vid.get("cover") or vid.get("originCover"),
        "duration": vid.get("duration"),
        "tags": [t.get("hashtagName") for t in d.get("textExtra", []) if t.get("hashtagName")],
    }


async def main():
    from TikTokApi import TikTokApi

    ms_token = os.environ.get("MS_TOKEN")
    out = {}
    async with TikTokApi() as api:
        await api.create_sessions(
            num_sessions=1,
            sleep_after=3,
            headless=True,
            ms_tokens=[ms_token] if ms_token else None,
        )
        for topic, query in INTERESTS.items():
            vids = []
            dropped = {"slop": 0, "likes": 0, "long": 0}
            # Retry: TikTok intermittently returns an empty (bot-detected)
            # response. Don't let one bad hit zero out a whole topic.
            for attempt in range(3):
                seen = {v["id"] for v in vids}
                try:
                    async for video in api.search.search_type(query, "item", count=SEARCH_COUNT):
                        d = video.as_dict
                        vid_id = d.get("id")
                        if not vid_id or vid_id in seen:
                            continue
                        seen.add(vid_id)
                        author = (d.get("author", {}) or {}).get("uniqueId", "u")
                        desc = d.get("desc", "") or ""
                        if is_slop(d, author, desc):
                            dropped["slop"] += 1
                            continue
                        if likes_of(d) < MIN_LIKES:
                            dropped["likes"] += 1
                            continue
                        dur = (d.get("video", {}) or {}).get("duration")
                        if dur and dur > MAX_DURATION:
                            dropped["long"] += 1
                            continue
                        vids.append(shape(topic, d))
                        if len(vids) >= PER_TOPIC:
                            break
                except Exception as e:  # noqa: BLE001
                    print(f"! {topic} (attempt {attempt+1}): {e}", file=sys.stderr)
                if len(vids) >= PER_TOPIC:
                    break
                await asyncio.sleep(2)
            vids.sort(key=lambda v: v["likes"], reverse=True)
            print(f"  {topic}: kept {len(vids)}  (dropped slop={dropped['slop']} lowlikes={dropped['likes']} long={dropped['long']})", file=sys.stderr)
            out[topic] = vids

    # Merge with the previous feed so a failed/empty scrape never regresses a
    # topic: union old+new, dedup by id, keep the highest-liked up to PER_TOPIC.
    old = {}
    if os.path.exists(OUT):
        try:
            with open(OUT, encoding="utf-8") as f:
                old = (json.load(f) or {}).get("topics", {})
        except Exception:  # noqa: BLE001
            old = {}
    merged = {}
    for topic in INTERESTS:
        byid = {v["id"]: v for v in old.get(topic, [])}
        for v in out.get(topic, []):
            byid[v["id"]] = v  # new data wins on refresh
        rows = sorted(byid.values(), key=lambda v: v.get("likes", 0), reverse=True)[:PER_TOPIC]
        merged[topic] = rows
        print(f"  {topic}: {len(rows)} after merge", file=sys.stderr)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated": True, "topics": merged}, f, ensure_ascii=False, indent=1)
    total = sum(len(v) for v in merged.values())
    print(f"Wrote {OUT} ({total} videos across {len(merged)} topics)", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
