"use client";

import { useEffect, useRef, useState } from "react";

// ---- YouTube IFrame API loader (once per page) ----
let ytApiPromise = null;
function loadYouTubeAPI() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev && prev();
      resolve(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

/**
 * Renders a single short video and tracks watch time.
 * - YouTube: real IFrame Player API events (accurate watch seconds + ended).
 * - TikTok: oEmbed blockquote; watch time approximated by on-screen timer.
 *
 * When `active` flips from true→false (or on unmount) it reports accumulated
 * watch stats via onReport({ watchSeconds, completed, atVideoEnd }).
 */
export default function VideoPlayer({ video, active, muted, onReport, onUnavailable }) {
  if (video.source === "demo")
    return <DemoPlayer {...{ video, active, muted, onReport, onUnavailable }} />;
  if (video.source === "tiktok")
    return <TikTokPlayer {...{ video, active, onReport, onUnavailable }} />;
  return <YouTubePlayer {...{ video, active, muted, onReport, onUnavailable }} />;
}

function useReporter(onReport) {
  // Guards against double-reporting the same view.
  const reported = useRef(false);
  return (payload) => {
    if (reported.current) return;
    reported.current = true;
    onReport?.(payload);
  };
}

// Zero-config demo source: a plain HTML5 <video>. Real play/progress events
// give accurate watch tracking, so personalization works in demo mode too.
function DemoPlayer({ video, active, muted, onReport, onUnavailable }) {
  const ref = useRef(null);
  const watchedRef = useRef(0);
  const endedRef = useRef(false);
  const report = useReporter(onReport);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = muted;
    if (active) {
      el.play?.().catch(() => {});
    } else {
      el.pause?.();
      finish(false);
    }
    return () => finish(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  function finish(atVideoEnd) {
    const secs = Math.round(watchedRef.current);
    if (secs <= 0 && !atVideoEnd) return;
    report({ watchSeconds: secs, completed: endedRef.current, atVideoEnd });
  }

  return (
    <div className="player-wrap">
      <video
        ref={ref}
        className="player-el"
        src={video.url}
        playsInline
        muted={muted}
        loop={false}
        onTimeUpdate={(e) => {
          watchedRef.current = e.target.currentTime;
        }}
        onEnded={() => {
          endedRef.current = true;
          finish(true);
        }}
        onError={() => onUnavailable?.()}
        style={{ objectFit: "cover", background: "#000" }}
      />
    </div>
  );
}

function YouTubePlayer({ video, active, muted, onReport, onUnavailable }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const watchedRef = useRef(0);
  const endedRef = useRef(false);
  const pollRef = useRef(null);
  const report = useReporter(onReport);

  // Build the player when this slide is close to view (active window).
  useEffect(() => {
    let cancelled = false;
    loadYouTubeAPI().then((YT) => {
      if (cancelled || !YT || !hostRef.current || playerRef.current) return;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId: video.id,
        playerVars: {
          playsinline: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          mute: muted ? 1 : 0,
        },
        events: {
          onReady: (e) => {
            muted ? e.target.mute() : e.target.unMute();
            if (active) e.target.playVideo();
          },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              endedRef.current = true;
              finish(true);
            }
          },
          onError: () => onUnavailable?.(), // private/removed → skip silently
        },
      });
    });
    return () => {
      cancelled = true;
      finish(false);
      clearInterval(pollRef.current);
      try {
        playerRef.current?.destroy();
      } catch {}
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Play/pause + accumulate watch time as active toggles.
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !p.playVideo) return;
    if (active) {
      muted ? p.mute() : p.unMute();
      try {
        p.playVideo();
      } catch {}
      // poll current time to accumulate watched seconds
      let last = safeTime(p);
      pollRef.current = setInterval(() => {
        const t = safeTime(p);
        if (t >= last) watchedRef.current += t - last;
        last = t;
      }, 500);
    } else {
      clearInterval(pollRef.current);
      try {
        p.pauseVideo();
      } catch {}
      finish(false); // report when leaving the slide
    }
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // React to global mute toggle.
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !p.mute) return;
    muted ? p.mute() : p.unMute();
  }, [muted]);

  function safeTime(p) {
    try {
      return p.getCurrentTime?.() || 0;
    } catch {
      return 0;
    }
  }

  function finish(atVideoEnd) {
    const secs = Math.round(watchedRef.current);
    if (secs <= 0 && !atVideoEnd) return; // nothing meaningful to report
    report({
      watchSeconds: secs,
      completed: endedRef.current,
      atVideoEnd: atVideoEnd || endedRef.current,
    });
  }

  return (
    <div className="player-wrap">
      <div ref={hostRef} className="player-el" />
    </div>
  );
}

function TikTokPlayer({ video, active, onReport }) {
  const startRef = useRef(null);
  const watchedRef = useRef(0);
  const report = useReporter(onReport);
  const rawId = video.id.replace(/^tt_/, "");

  // Approximate watch time by how long the slide stays active (TikTok embeds
  // don't expose reliable play/progress events).
  useEffect(() => {
    if (active) {
      startRef.current = Date.now();
    } else if (startRef.current) {
      watchedRef.current += (Date.now() - startRef.current) / 1000;
      startRef.current = null;
      const secs = Math.round(watchedRef.current);
      const completed = video.duration > 0 && secs >= video.duration * 0.9;
      if (secs > 0) report({ watchSeconds: secs, completed, atVideoEnd: completed });
    }
    return () => {
      if (startRef.current) {
        watchedRef.current += (Date.now() - startRef.current) / 1000;
        startRef.current = null;
      }
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Official TikTok embed iframe — works for any public video id, no oEmbed
  // fetch, no CORS. Only mounted when the slide is near view (parent lazy-loads).
  return (
    <div className="player-wrap">
      <iframe
        className="player-el"
        src={`https://www.tiktok.com/embed/v2/${rawId}?lang=en&autoplay=${active ? 1 : 0}&music_info=0&description=0`}
        allow="autoplay; encrypted-media; fullscreen"
        title={video.title}
      />
    </div>
  );
}
