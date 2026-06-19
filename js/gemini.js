/* ============================================================
   THE HOT TAKE - Gemini API wrapper
   Gemini 3.1 Flash Lite - Topic generation ONLY.
   ============================================================ */

const GEMINI_MODEL = "gemini-3.1-flash-lite";

class GeminiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GeminiError";
    this.code = code || "unknown";
  }
}

async function callGemini(prompt, { temperature = 0.7, maxOutputTokens = 400, json = false } = {}) {
  // Routes to the secure Vercel API endpoint
  const url = '/api/gemini';

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(json ? { responseMimeType: "application/json" } : {})
    }
  };

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new GeminiError("Network error reaching the server. Check your connection.", "network");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || "";
    } catch (_) {}

    if (response.status === 400 && /API key/i.test(detail)) {
      throw new GeminiError("Server API key looks invalid. Check Vercel Environment Variables.", "bad-key");
    }
    if (response.status === 403) {
      throw new GeminiError("Key rejected (403). It may lack Gemini API access.", "forbidden");
    }
    if (response.status === 429) {
      throw new GeminiError("Rate limited by Gemini. Wait a few seconds and retry.", "rate-limit");
    }
    throw new GeminiError(detail || `Gemini request failed (${response.status}).`, "http-" + response.status);
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    throw new GeminiError("Gemini returned an unreadable response.", "parse");
  }

  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const text = candidate?.content?.parts?.map(p => p.text || "").join("") || "";

  if (!text) {
    if (finishReason === "SAFETY") {
      throw new GeminiError("Gemini blocked this for safety reasons. Try a different lane.", "safety");
    }
    throw new GeminiError("Gemini returned an empty response.", "empty");
  }

  return text.trim();
}

/* ---------- Topic generation ---------- */

// Maps a dimension key (from app.js DIMENSIONS) to writing-craft instructions
// that, if followed, would specifically exercise that dimension. This is what
// makes topic generation archetype-aware instead of purely random.
const DIMENSION_TARGETING = {
  structural_clarity: {
    label: "Structural Clarity",
    instruction: "The topic should reward a writer who can organize a complex idea into a clean, logical sequence. Favor topics that naturally have multiple moving parts (causes, stages, categories, before/after) so structure becomes unavoidable to do well."
  },
  cognitive_depth: {
    label: "Cognitive Depth",
    instruction: "The topic should be impossible to answer well with surface-level description. It must require the writer to analyze, compare, or evaluate - not just describe. Avoid topics with one obvious surface-level answer."
  },
  original_synthesis: {
    label: "Original Synthesis",
    instruction: "The topic should reward unexpected connections - ideally pulling together two things that don't obviously belong together, or asking for a genuinely novel angle on something familiar. Avoid the most predictable take being the only one available."
  },
  rhetorical_power: {
    label: "Rhetorical Power",
    instruction: "The topic must require the writer to persuade, not just inform. Frame it as a position to defend, a case to make, or a claim to argue for against an implied skeptic. The writer should have to convince someone, not just explain something."
  },
  metacognitive_awareness: {
    label: "Metacognitive Awareness",
    instruction: "The topic should invite the writer to examine their own certainty - ideas where reasonable people could land in different places, or where the writer has to acknowledge the limits or tradeoffs of their own claim. Avoid topics with a single 'correct' answer."
  }
};

function buildTopicPrompt(domain, difficulty, durationMinutes, wordGoal, countHint, targetDimension) {
  // Add extra instruction based on difficulty
  let complexityNote = "";
  if (difficulty === "easy") {
    complexityNote = "Make the topic concrete, relatable, and easy to dive into. Avoid abstract or multi-layered ideas.";
  } else if (difficulty === "medium") {
    complexityNote = "Make the topic thought-provoking with a moderate level of abstraction. It should challenge the writer but remain accessible.";
  } else if (difficulty === "hard") {
    complexityNote = "Make the topic complex, unexpected, or multi-faceted. It should force the writer to think deeply and make connections. Surprise them.";
  }

  const difficultyInstructions = {
    easy: `Generate ONE single writing topic that is directly and clearly within the domain. 
It should be concrete, approachable, and give the writer a very clear angle to write from.
The topic must be something a person can write meaningful, non-trivial content about - not a vague philosophical question.`,

    medium: `Generate EXACTLY ${countHint} distinct writing topics, all within the domain but meaningfully different from each other in angle, perspective, and approach.
Each topic must be specific enough that two different writers would produce completely different pieces.
Avoid overlapping ideas - they must feel like 4 genuinely separate creative challenges.`,

    hard: `Generate ONE single topic that can come from ANY domain or a surprising mashup of two domains. 
Make it specific, weird, sharp, or oddly niche - something that forces the writer to think on their feet.
Avoid generic or philosophical prompts; it should feel like a curveball that still has a clear starting point.`
  } [difficulty];

  // --- Archetype-aware targeting block ---
  // When the app has detected a consistently weak dimension across recent rounds,
  // it passes that dimension here so the generated topic is calibrated to exercise
  // exactly that muscle, rather than generating a purely random prompt.
  let targetingBlock = "";
  if (targetDimension && DIMENSION_TARGETING[targetDimension.key]) {
    const t = DIMENSION_TARGETING[targetDimension.key];
    targetingBlock = `
TARGETED CALIBRATION (important):
This writer's recent sessions show their weakest dimension is "${t.label}" (averaging ${targetDimension.avgScore}/100 over their last several rounds).
${t.instruction}
Do NOT mention this calibration in the topic or direction text itself - the writer should experience it as a natural topic, not a training exercise. Just make sure the topic genuinely makes that dimension matter.
`;
  }

  return `You are a creative director for "The Hot Take," a high-pressure writing app for Gen-Z users.

Domain: ${domain.name}
What this domain covers: ${domain.blurb}
Difficulty: ${difficulty.toUpperCase()}
Writer has: ${durationMinutes} minutes, must hit at least ${wordGoal} words.

YOUR TASK:
${difficultyInstructions}

${complexityNote}
${targetingBlock}
CRITICAL FORMAT RULES:
- Each topic must have TWO parts: a short punchy TITLE (under 15 words) and a DIRECTION (2-3 sentences that guide the writer on what angle to take, what to include, and what makes this interesting - without writing the piece for them).
- The direction should spark ideas, not constrain them. It's a launchpad, not a cage.
- NO emoji, NO hashtags, NO quotation marks around the title.
- Be domain-specific - a Gaming topic should feel unmistakably about gaming culture, not generic creativity.
- Avoid: "Write about...", "Discuss...", "Explore..." - use active, provocative framing instead: "Defend...", "Explain why...", "Design...", "Make the case that...", "Argue whether...", "Describe the world where..."

${difficulty === "medium"
  ? `Return ONLY valid JSON, no markdown fences, in this EXACT shape:
{
  "topics": [
    {"title": "short punchy topic title", "direction": "2-3 sentence writing direction that guides the writer"},
    {"title": "...", "direction": "..."},
    {"title": "...", "direction": "..."},
    {"title": "...", "direction": "..."}
  ]
}`
  : `Return ONLY valid JSON, no markdown fences, in this EXACT shape:
{"title": "short punchy topic title", "direction": "2-3 sentence writing direction that guides the writer"}`
}`;
}

async function generateTopic(domain, difficulty, durationMinutes, wordGoal, targetDimension) {
  const temp = difficulty === "easy" ? 0.75 : difficulty === "medium" ? 0.9 : 1.0;
  const countHint = 4;
  const maxTokens = difficulty === "medium" ? 700 : 250;
  const prompt = buildTopicPrompt(domain, difficulty, durationMinutes, wordGoal, countHint, targetDimension);

  const raw = await callGemini(prompt, {
    temperature: temp,
    maxOutputTokens: maxTokens,
    json: true
  });

  // --- Robust JSON extraction ---
  let jsonString = raw;

  // 1. Remove markdown code fences safely without breaking chat formatting
  const fenceMatch = raw.match(/[`]{3}(?:json)?\s*([\s\S]*?)[`]{3}/);
  if (fenceMatch) {
    jsonString = fenceMatch[1].trim();
  } else {
    // 2. Try to extract the first JSON object using regex
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (_) {
    // 3. Last resort: try to parse the raw string directly
    try {
      parsed = JSON.parse(raw);
    } catch (__) {
      console.error("Gemini raw response:", raw);
      throw new GeminiError("Couldn't parse the topic Gemini sent back. The response was not valid JSON. Retrying may help.", "parse");
    }
  }

  if (difficulty === "medium") {
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter(t => t && t.title && t.direction)
      : [];
    if (topics.length === 0) {
      throw new GeminiError("Gemini didn't return usable topic options.", "empty");
    }
    return { type: "choice", topics };
  }

  if (!parsed.title || !parsed.direction) {
    throw new GeminiError("Gemini returned an incomplete topic. Retrying may help.", "empty");
  }

  return { type: "single", topic: parsed.title, direction: parsed.direction };
}