#!/usr/bin/env python3
"""Unofficial TikTok keyword search helper.

Prints a JSON array of video dicts to stdout:
  [{id, url, desc, title, cover, duration, author, tags}, ...]

Uses the community `TikTokApi` package (https://github.com/davidteather/TikTok-Api).
This is unofficial and WILL break when TikTok changes their site — that's
expected. On any error we exit non-zero with a message on stderr so the Node
caller falls back to YouTube.

Install:  pip install TikTokApi && python -m playwright install chromium
Usage:    python tiktok_search.py "psychology facts" 25
"""
import asyncio
import json
import os
import sys


async def main():
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 25
    if not query:
        print("[]")
        return

    from TikTokApi import TikTokApi  # imported late so import errors -> stderr

    ms_token = os.environ.get("MS_TOKEN")
    min_likes = int(os.environ.get("MIN_LIKES", "1000"))
    # No AI slop, no ads, no faceless-fact channels.
    slop_author = ("motivat", "_facts", "facts_", "factss", "abstract_",
                   "aivoice", "ai_", "_ai", "dailywisdom", "wisdom_",
                   "deepthought", "quotes_", "factoverload")
    out = []
    async with TikTokApi() as api:
        await api.create_sessions(
            num_sessions=1,
            sleep_after=3,
            headless=True,
            ms_tokens=[ms_token] if ms_token else None,
            browser=os.environ.get("TIKTOK_BROWSER", "chromium"),
        )
        # v7 keyword search: obj_type "item" returns videos. Over-fetch so the
        # like/slop filter still leaves enough results.
        async for video in api.search.search_type(query, "item", count=count * 4):
            d = video.as_dict
            vid = d.get("video", {}) or {}
            author = (d.get("author", {}) or {}).get("uniqueId", "u")
            try:
                likes = int((d.get("stats") or {}).get("diggCount") or 0)
            except (TypeError, ValueError):
                likes = 0
            if (d.get("AIGCDescription") or "").strip() or d.get("isAd"):
                continue
            if any(s in author.lower() for s in slop_author):
                continue
            if likes < min_likes:
                continue
            out.append(
                {
                    "id": d.get("id"),
                    "url": f"https://www.tiktok.com/@{author}/video/{d.get('id')}",
                    "desc": d.get("desc", ""),
                    "title": d.get("desc", ""),
                    "likes": likes,
                    "cover": vid.get("cover") or vid.get("originCover"),
                    "duration": vid.get("duration"),
                    "author": author,
                    "tags": [t.get("hashtagName") for t in d.get("textExtra", []) if t.get("hashtagName")],
                }
            )
            if len(out) >= count:
                break
    print(json.dumps(out))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:  # noqa: BLE001 — surface any failure to the Node caller
        print(str(e), file=sys.stderr)
        sys.exit(1)
