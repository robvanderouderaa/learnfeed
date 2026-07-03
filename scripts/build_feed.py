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
    "psychology": "psychology facts",
    "science": "science facts",
    "tech": "technology explained",
    "self-improvement": "self improvement tips",
    "history": "history facts",
}
PER_TOPIC = 12
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "feed.json")


def shape(topic, d):
    stats = d.get("video", {}) or {}
    author = (d.get("author", {}) or {}).get("uniqueId", "u")
    return {
        "id": d.get("id"),
        "source": "tiktok",
        "topic": topic,
        "url": f"https://www.tiktok.com/@{author}/video/{d.get('id')}",
        "title": d.get("desc", ""),
        "author": author,
        "cover": stats.get("cover") or stats.get("originCover"),
        "duration": stats.get("duration"),
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
            seen = set()
            try:
                async for video in api.search.search_type(query, "item", count=PER_TOPIC * 2):
                    d = video.as_dict
                    vid = shape(topic, d)
                    if not vid["id"] or vid["id"] in seen:
                        continue
                    # keep short-form only
                    if vid["duration"] and vid["duration"] > 90:
                        continue
                    seen.add(vid["id"])
                    vids.append(vid)
                    if len(vids) >= PER_TOPIC:
                        break
            except Exception as e:  # noqa: BLE001
                print(f"! {topic}: {e}", file=sys.stderr)
            print(f"  {topic}: {len(vids)} videos", file=sys.stderr)
            out[topic] = vids

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated": True, "topics": out}, f, ensure_ascii=False, indent=1)
    total = sum(len(v) for v in out.values())
    print(f"Wrote {OUT} ({total} videos across {len(out)} topics)", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
