"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Settings() {
  const [interests, setInterests] = useState([]);
  const [meta, setMeta] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [newTopic, setNewTopic] = useState("");

  async function loadAll() {
    const [i, s, sug] = await Promise.all([
      fetch("/api/interests").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/suggestions").then((r) => r.json()),
    ]);
    setInterests(i.interests);
    setMeta(s);
    setSuggestions(sug.suggestions);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function toggleInterest(it) {
    await fetch("/api/interests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id, active: !it.active }),
    });
    loadAll();
  }

  async function addTopic(name) {
    const n = (name ?? newTopic).trim();
    if (!n) return;
    await fetch("/api/interests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    setNewTopic("");
    loadAll();
  }

  async function toggleQuiz() {
    const on = meta.settings.QUIZ_ENABLED === "true";
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ QUIZ_ENABLED: (!on).toString() }),
    });
    loadAll();
  }

  if (!meta) return <div className="page"><p className="muted">Loading…</p></div>;

  const quizOn = meta.settings.QUIZ_ENABLED === "true";

  return (
    <div className="page">
      <Link className="link-back" href="/">← Back to feed</Link>
      <h1>Settings</h1>

      <div className="section">
        <h3>Your interests</h3>
        {interests.map((it) => (
          <div className="row" key={it.id}>
            <span>{it.name}</span>
            <button
              className={`toggle ${it.active ? "on" : ""}`}
              onClick={() => toggleInterest(it)}
              aria-label={`toggle ${it.name}`}
            />
          </div>
        ))}
        {interests.length === 0 && <p className="muted">No interests yet.</p>}
        <div className="input-inline">
          <input
            placeholder="Add a topic…"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTopic()}
          />
          <button className="btn secondary" onClick={() => addTopic()}>Add</button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="section">
          <h3>Suggested for you</h3>
          <p className="muted" style={{ marginTop: -6, marginBottom: 10 }}>
            Topics you watch a lot but haven't added yet.
          </p>
          <div className="chip-grid">
            {suggestions.map((s) => (
              <button key={s.name} className="chip" onClick={() => addTopic(s.name)}>
                + {s.name} <span className="muted">({s.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <h3>Retention quiz</h3>
        <div className="row">
          <div>
            <div>Quiz mode</div>
            <div className="muted">
              Pauses every 5 min to quiz you. Off by default.
            </div>
          </div>
          <button className={`toggle ${quizOn ? "on" : ""}`} onClick={toggleQuiz} />
        </div>
        <p className="muted">
          Rank {meta.rank} · {meta.tier}
        </p>
      </div>

      <div className="section">
        <h3>Quota &amp; sources</h3>
        <div className="row">
          <span>YouTube quota today</span>
          <span className={meta.quota.low ? "" : "muted"}>
            {meta.quota.used} / {meta.quota.limit}
            {meta.quota.low ? " ⚠️" : ""}
          </span>
        </div>
        {meta.sources.map((s) => (
          <div className="row" key={s.source}>
            <span>{s.source}</span>
            <span className="muted">
              {s.total > 0
                ? `${Math.round((s.success_rate || 0) * 100)}% ok (${s.success}/${s.total})`
                : "no calls yet"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
