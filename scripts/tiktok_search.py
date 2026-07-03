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
import sys


async def main():
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 25
    if not query:
        print("[]")
        return

    from TikTokApi import TikTokApi  # imported late so import errors -> stderr

    out = []
    async with TikTokApi() as api:
        await api.create_sessions(num_sessions=1, sleep_after=3)
        async for video in api.search.videos(query, count=count):
            d = video.as_dict
            stats = d.get("video", {}) or {}
            out.append(
                {
                    "id": d.get("id"),
                    "url": f"https://www.tiktok.com/@{d.get('author', {}).get('uniqueId','u')}/video/{d.get('id')}",
                    "desc": d.get("desc", ""),
                    "title": d.get("desc", ""),
                    "cover": stats.get("cover") or stats.get("originCover"),
                    "duration": stats.get("duration"),
                    "author": d.get("author", {}).get("uniqueId"),
                    "tags": [t.get("hashtagName") for t in d.get("textExtra", []) if t.get("hashtagName")],
                }
            )
    print(json.dumps(out))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:  # noqa: BLE001 — surface any failure to the Node caller
        print(str(e), file=sys.stderr)
        sys.exit(1)
