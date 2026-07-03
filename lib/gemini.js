// Gemini client — only exercised once QUIZ_ENABLED is flipped on.
// Uses the latest fast model for cheap single-question generation.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is not set");
  return k;
}

// Generate a single multiple-choice question from arbitrary source text.
// difficulty (1..5) nudges the prompt so questions get harder with rank.
export async function generateQuestion(sourceText, difficulty = 1) {
  const prompt = [
    `You are writing ONE multiple-choice quiz question to test whether someone`,
    `actually retained the key idea from a short educational video.`,
    `Difficulty level: ${difficulty} of 5 (higher = more subtle/inferential).`,
    `Source material:`,
    `"""${(sourceText || "").slice(0, 6000)}"""`,
    ``,
    `Respond with ONLY minified JSON of shape:`,
    `{"question": string, "choices": [string, string, string, string], "correct_answer": string}`,
    `The correct_answer MUST be exactly one of the choices.`,
  ].join("\n");

  const res = await fetch(`${ENDPOINT(MODEL)}?key=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = JSON.parse(text);
  if (
    !parsed.question ||
    !Array.isArray(parsed.choices) ||
    parsed.choices.length !== 4 ||
    !parsed.choices.includes(parsed.correct_answer)
  ) {
    throw new Error("Gemini returned malformed question");
  }
  return parsed;
}
