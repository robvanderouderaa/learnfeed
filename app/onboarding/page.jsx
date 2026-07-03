"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SUGGESTED = [
  "psychology",
  "tech",
  "science",
  "self-improvement",
  "history",
  "space",
  "philosophy",
  "finance",
];

export default function Onboarding() {
  const router = useRouter();
  const [picked, setPicked] = useState(new Set(["psychology", "science"]));
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);

  function toggle(name) {
    setPicked((p) => {
      const next = new Set(p);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function addCustom() {
    const c = custom.trim().toLowerCase();
    if (c) setPicked((p) => new Set(p).add(c));
    setCustom("");
  }

  async function start() {
    if (picked.size === 0) return;
    setLoading(true);
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interests: [...picked] }),
    });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="page">
      <h1>What do you want to learn?</h1>
      <p className="muted">Pick a few interests. You can change these anytime.</p>

      <div className="section" style={{ marginTop: 20 }}>
        <div className="chip-grid">
          {[...new Set([...SUGGESTED, ...picked])].map((name) => (
            <button
              key={name}
              className={`chip ${picked.has(name) ? "selected" : ""}`}
              onClick={() => toggle(name)}
            >
              {picked.has(name) ? "✓ " : ""}
              {name}
            </button>
          ))}
        </div>

        <div className="input-inline">
          <input
            placeholder="Add your own…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
          />
          <button className="btn secondary" onClick={addCustom}>
            Add
          </button>
        </div>
      </div>

      <button className="btn" disabled={picked.size === 0 || loading} onClick={start}>
        {loading ? "Loading your feed…" : `Start (${picked.size})`}
      </button>
    </div>
  );
}
