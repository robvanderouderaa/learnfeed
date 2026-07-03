"use client";

import { useState } from "react";

// Rendered only when a quiz triggers (QUIZ_ENABLED must be on).
export default function QuizModal({ quiz, onClose }) {
  const [chosen, setChosen] = useState(null);
  const [result, setResult] = useState(null);

  async function answer(choice) {
    if (chosen != null) return;
    setChosen(choice);
    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: quiz.videoId, choice }),
    }).then((r) => r.json());
    setResult(res);
  }

  return (
    <div className="quiz-backdrop">
      <div className="quiz-card">
        <div className="muted" style={{ marginBottom: 8 }}>
          Quick check · difficulty {quiz.difficulty}
        </div>
        <h3>{quiz.question}</h3>
        {quiz.choices.map((c) => {
          let cls = "quiz-choice";
          if (result) {
            if (c === result.correctAnswer) cls += " correct";
            else if (c === chosen) cls += " wrong";
          }
          return (
            <button key={c} className={cls} onClick={() => answer(c)} disabled={!!chosen}>
              {c}
            </button>
          );
        })}
        {result && (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: "0 0 12px" }}>
              {result.correct ? "✅ Correct! +15" : "❌ Not quite. −15"} · Rank {result.rank}{" "}
              ({result.tier})
            </p>
            <button className="btn" onClick={onClose}>
              Keep watching
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
