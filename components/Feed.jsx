"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import VideoPlayer from "./VideoPlayer.jsx";
import QuizModal from "./QuizModal.jsx";

const PRELOAD_AHEAD = 2; // mount players for the next 1-2 slides
const PRELOAD_BEHIND = 1;

export default function Feed() {
  const [videos, setVideos] = useState([]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true); // muted by default (autoplay policy)
  const [mode, setMode] = useState("feed"); // 'feed' | 'search'
  const [query, setQuery] = useState("");
  const [state, setState] = useState("loading"); // loading | ready | empty | noTopics
  const [quiz, setQuiz] = useState(null);
  const feedRef = useRef(null);
  const debounceRef = useRef(null);
  const unavailable = useRef(new Set());

  const loadFeed = useCallback(async () => {
    setState("loading");
    const data = await fetch("/api/feed?limit=30").then((r) => r.json());
    if (data.needTopics) return setState("noTopics");
    if (!data.videos || data.videos.length === 0) return setState("empty");
    setVideos(data.videos);
    setActive(0);
    setMode("feed");
    setState("ready");
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Debounced live search (min 3 chars).
  function onSearchChange(v) {
    setQuery(v);
    clearTimeout(debounceRef.current);
    const q = v.trim();
    if (q.length < 3) {
      if (mode === "search" && q.length === 0) loadFeed();
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const data = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) =>
        r.json()
      );
      if (data.videos && data.videos.length) {
        setVideos(data.videos);
        setActive(0);
        setMode("search");
        setState("ready");
        feedRef.current?.scrollTo({ top: 0 });
      }
    }, 450);
  }

  // Report a watch/skip event, then handle any quiz trigger.
  const reportWatch = useCallback(
    async (video, payload) => {
      try {
        const res = await fetch("/api/watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: video.id, ...payload }),
        }).then((r) => r.json());
        if (res.quiz) {
          // QUIZ_ENABLED is on and the 5-min threshold was hit at a video end.
          const q = await fetch(`/api/quiz?videoId=${video.id}`).then((r) => r.json());
          if (q.enabled) setQuiz(q);
        }
      } catch {
        /* watch tracking is best-effort */
      }
    },
    []
  );

  // Skip a broken/unavailable video: mark it and advance the scroll.
  const handleUnavailable = useCallback(
    (index) => {
      const v = videos[index];
      if (v) unavailable.current.add(v.id);
      const next = document.querySelector(`[data-slide="${index + 1}"]`);
      next?.scrollIntoView({ behavior: "smooth" });
    },
    [videos]
  );

  // Detect the active slide via IntersectionObserver.
  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const idx = Number(e.target.getAttribute("data-slide"));
            setActive(idx);
          }
        }
      },
      { root, threshold: [0.6] }
    );
    root.querySelectorAll(".slide").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [videos]);

  // Infinite-ish: when nearing the end of the rotation feed, load more.
  useEffect(() => {
    if (mode === "feed" && state === "ready" && active >= videos.length - 3) {
      fetch("/api/feed?limit=30")
        .then((r) => r.json())
        .then((data) => {
          if (data.videos?.length) {
            setVideos((prev) => {
              const seen = new Set(prev.map((v) => v.id));
              const fresh = data.videos.filter((v) => !seen.has(v.id));
              return fresh.length ? [...prev, ...fresh] : prev;
            });
          }
        })
        .catch(() => {});
    }
  }, [active, mode, state, videos.length]);

  // Arrow Up/Down (+ PageUp/Down, Space) navigate between videos.
  useEffect(() => {
    function onKey(e) {
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      const dir = (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") ? 1
        : (e.key === "ArrowUp" || e.key === "PageUp") ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const target = document.querySelector(`[data-slide="${active + dir}"]`);
      target?.scrollIntoView({ behavior: "smooth" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (state === "loading") {
    return <div className="center-state"><p>Loading your feed…</p></div>;
  }
  if (state === "noTopics" || state === "empty") {
    return (
      <div className="center-state">
        <h2>{state === "noTopics" ? "No interests yet" : "You're all caught up!"}</h2>
        <p>
          {state === "noTopics"
            ? "Add a few topics to start building your feed."
            : "No unwatched videos left for your active interests. Add more topics to keep learning."}
        </p>
        <Link className="btn" href="/settings">
          Add topics
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <input
          className="search-input"
          placeholder="Search any topic…"
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {mode === "search" && (
          <button className="icon-btn" title="Back to feed" onClick={() => { setQuery(""); loadFeed(); }}>
            ✕
          </button>
        )}
        <Link className="icon-btn" href="/settings" title="Settings">
          ⚙
        </Link>
      </div>

      <div className="feed" ref={feedRef}>
        {videos.map((v, i) => {
          const near = i >= active - PRELOAD_BEHIND && i <= active + PRELOAD_AHEAD;
          return (
            <div className="slide" data-slide={i} key={v.id}>
              <button
                className="mute-btn"
                onClick={() => setMuted((m) => !m)}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? "🔇" : "🔊"}
              </button>

              {near ? (
                <VideoPlayer
                  video={v}
                  active={i === active}
                  muted={muted}
                  onReport={(payload) => reportWatch(v, payload)}
                  onUnavailable={() => handleUnavailable(i)}
                />
              ) : (
                // Lazy: just a thumbnail until the slide is close to view.
                <div
                  className="thumb-fallback"
                  style={{ backgroundImage: `url(${v.thumbnail})` }}
                />
              )}

              {/* TikTok's player already shows title/author/likes — only add our
                  overlay for YouTube/demo sources so we don't double up. */}
              {v.source !== "tiktok" && (
                <div className="overlay">
                  {v.topic && <span className="topic">{v.topic}</span>}
                  <p className="title">{v.title}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {quiz && <QuizModal quiz={quiz} onClose={() => setQuiz(null)} />}
    </>
  );
}
