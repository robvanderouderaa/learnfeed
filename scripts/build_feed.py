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
import subprocess
import sys

# interest -> TikTok search query (mirrors lib/interests.js)
INTERESTS = {
    "psychology": "psychology explained",
    "science": "science explained",
    "tech": "how technology works",
    "self-improvement": "productivity advice",
    "history": "history documentary short",
}
PER_TOPIC = 8
SEARCH_COUNT = 90          # over-fetch, filtering throws a lot away
MIN_LIKES = 1000           # user requirement: no low-engagement clips
MAX_DURATION = 80          # keep clips short so the hosted files stay small
HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "docs", "feed.json")
MEDIA_DIR = os.path.join(HERE, "..", "docs", "media")  # transcoded MP4s we host

# Download each TikTok and transcode to a small, universally-playable H.264 MP4
# so the site plays it in a native <video> (real mobile autoplay, no iframe).
def encode_video(raw_bytes, vid_id):
    os.makedirs(MEDIA_DIR, exist_ok=True)
    out_path = os.path.join(MEDIA_DIR, f"{vid_id}.mp4")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 10000:
        return f"media/{vid_id}.mp4"  # already have it (cache across runs)
    tmp = os.path.join(MEDIA_DIR, f"{vid_id}.src")
    with open(tmp, "wb") as f:
        f.write(raw_bytes)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp,
             "-c:v", "libx264", "-crf", "30", "-preset", "veryfast",
             "-vf", "scale=-2:720", "-maxrate", "900k", "-bufsize", "1500k",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k",
             "-movflags", "+faststart", out_path],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception as e:  # noqa: BLE001
        print(f"    ffmpeg fail {vid_id}: {e}", file=sys.stderr)
        return None
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    return f"media/{vid_id}.mp4" if os.path.exists(out_path) else None

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
                        # Download + transcode now (need the video object here).
                        # Only keep the clip if we got a playable local file.
                        row = shape(topic, d)
                        try:
                            raw = await video.bytes()
                            row["file"] = encode_video(raw, vid_id)
                        except Exception as e:  # noqa: BLE001
                            print(f"    download fail {vid_id}: {str(e)[:60]}", file=sys.stderr)
                            row["file"] = None
                        if not row["file"]:
                            continue
                        vids.append(row)
                        print(f"    + {vid_id} ({len(vids)}/{PER_TOPIC})", file=sys.stderr)
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
    def has_media(v):
        f = v.get("file")
        return f and os.path.exists(os.path.join(HERE, "..", "docs", f))

    merged = {}
    for topic in INTERESTS:
        byid = {v["id"]: v for v in old.get(topic, []) if has_media(v)}
        for v in out.get(topic, []):
            byid[v["id"]] = v  # new data wins on refresh
        rows = [v for v in byid.values() if has_media(v)]
        rows.sort(key=lambda v: v.get("likes", 0), reverse=True)
        rows = rows[:PER_TOPIC]
        merged[topic] = rows
        print(f"  {topic}: {len(rows)} after merge", file=sys.stderr)

    # Remove orphaned media files no longer referenced by the feed.
    keep = {os.path.basename(v["file"]) for vs in merged.values() for v in vs}
    if os.path.isdir(MEDIA_DIR):
        for fn in os.listdir(MEDIA_DIR):
            if fn.endswith(".mp4") and fn not in keep:
                try:
                    os.remove(os.path.join(MEDIA_DIR, fn))
                except OSError:
                    pass

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated": True, "topics": merged}, f, ensure_ascii=False, indent=1)
    total = sum(len(v) for v in merged.values())
    print(f"Wrote {OUT} ({total} videos across {len(merged)} topics)", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
