/* ============================================================
   THE HOT TAKE - Gemini API wrapper v2
   Gemini Flash Lite → Topic generation ONLY.
   Falls back to Groq llama-3.3-70b if Gemini fails.
   ============================================================ */

const GEMINI_MODEL = "gemini-2.0-flash-lite";

class GeminiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GeminiError";
    this.code = code || "unknown";
  }
}

async function callGemini(prompt, { temperature = 0.7, maxOutputTokens = 400, json = false } = {}) {
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
    throw new GeminiError("Network error reaching the server.", "network");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || "";
    } catch (_) {}

    if (response.status === 400 && /API key/i.test(detail)) {
      throw new GeminiError("Server API key looks invalid.", "bad-key");
    }
    if (response.status === 403) {
      throw new GeminiError("Key rejected (403).", "forbidden");
    }
    if (response.status === 429) {
      throw new GeminiError("Rate limited by Gemini.", "rate-limit");
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
      throw new GeminiError("Gemini blocked this for safety reasons.", "safety");
    }
    throw new GeminiError("Gemini returned an empty response.", "empty");
  }

  return text.trim();
}

/* ============================================================
   GROQ FALLBACK - called when Gemini fails
   Uses llama-3.3-70b via /api/groq endpoint
   ============================================================ */

async function callGroqFallback(prompt, { temperature = 0.7, maxOutputTokens = 600 } = {}) {
  const body = {
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature,
    max_tokens: maxOutputTokens,
    response_format: { type: "json_object" }
  };

  let response;
  try {
    response = await fetch('/api/groq', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new GeminiError("Fallback network error.", "network");
  }

  if (!response.ok) {
    throw new GeminiError(`Groq fallback failed (${response.status}).`, "fallback-fail");
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new GeminiError("Groq fallback returned empty response.", "empty");
  return text.trim();
}

/* ============================================================
   DIMENSION TARGETING
   Maps each weak dimension to a craft-level instruction
   that exercises it through the topic itself — not as a
   label, but as a structural demand baked into the prompt.
   ============================================================ */
const DIMENSION_TARGETING = {
  structural_clarity: {
    label: "Structural Clarity",
    instruction: `Design a topic that has genuine internal complexity — multiple stages, causes, or tensions that can't be resolved in a single paragraph. The writer who succeeds will need to make deliberate choices about sequencing and reader orientation. Avoid topics with a single linear answer. Favor topics where the *order* in which ideas are presented actually changes the argument.`
  },
  cognitive_depth: {
    label: "Cognitive Depth",
    instruction: `Design a topic that rewards analysis over observation. It should be impossible to write well about by just describing what exists — the writer has to compare, weigh tradeoffs, or challenge an assumption. Avoid topics where the surface-level observation is also the insight. The best response should make the reader think "I wouldn't have seen it that way."`
  },
  original_synthesis: {
    label: "Original Synthesis",
    instruction: `Design a topic that rewards unexpected connections between two things that don't obviously belong in the same sentence. Or, take a familiar subject and find the sharpest possible non-default angle on it — one where the obvious take is actively boring. The writer who plays it safe should feel like they wasted the topic. Surprise is the goal.`
  },
  rhetorical_power: {
    label: "Rhetorical Power",
    instruction: `Design a topic that's inherently a position to defend, not an idea to explain. Frame it so there's a clear implied skeptic in the room — someone the writer has to convince, not just inform. The stakes should feel real. Neutral, both-sides topics actively undermine this. Pick something where one side of the argument actually matters more.`
  },
  metacognitive_awareness: {
    label: "Metacognitive Awareness",
    instruction: `Design a topic where the honest answer is not simple — where a thoughtful writer would need to acknowledge their own uncertainty, name a tradeoff they can't resolve, or qualify a claim they'd otherwise make confidently. Avoid topics with clear correct answers. The best response should feel intellectually honest, not just smart.`
  }
};

/* ============================================================
   DOMAIN PERSONALITY VOICE LAYER
   Each cluster gets a distinct editorial voice so topics
   don't sound interchangeable across very different domains.
   ============================================================ */
const CLUSTER_VOICE = {
  culture: {
    tone: "irreverent, chronically online, aware of irony",
    avoid: "academic analysis, explaining context most Gen-Z already knows",
    favor: "takes that would start arguments in a Discord server, topics where the 'wrong' answer is more interesting than the 'right' one"
  },
  lifestyle: {
    tone: "personal, grounded, experiential — like a smart friend with actual opinions",
    avoid: "self-help speak, vague wellness language, generic travel writing clichés",
    favor: "topics tied to real lived decisions, stuff that reveals something true about how people actually live vs. how they say they do"
  },
  mind: {
    tone: "honest, a little uncomfortable, psychologically sharp",
    avoid: "TED talk framing, therapy speak, anything that would fit on an Instagram infographic",
    favor: "topics that make the writer examine something they'd rather not, ideas with a genuinely disturbing or counterintuitive core"
  },
  hustle: {
    tone: "skeptical of hype, builder-brained, economically literate",
    avoid: "guru language, broad platitudes about 'the future of work'",
    favor: "topics grounded in a specific mechanism, decision, or tradeoff — not 'is AI good?' but 'what does a world with 10x cheaper labor actually mean for how you price your time?'"
  }
};

/* ============================================================
   DIFFICULTY CONFIGURATIONS
   Each level changes: count, framing, complexity, selection mechanic
   ============================================================ */
const DIFFICULTY_CONFIG = {
  easy: {
    count: 4,
    selectionNote: "Writer picks one of four. These are their runway — accessible enough to start immediately, specific enough to generate distinct pieces.",
    complexityNote: `Make each topic entry-level for the domain — concrete, single-layered, and fast to form an opinion on. A writer who's never thought about this before should feel ready to type in ten seconds. Think: one clear angle, no required background knowledge, immediate personal relevance.`,
    tokenBudget: 500,
    temp: 0.75,
    jsonShape: `{"topics": [
  {"title": "...", "direction": "..."},
  {"title": "...", "direction": "..."},
  {"title": "...", "direction": "..."},
  {"title": "...", "direction": "..."}
]}`
  },
  medium: {
    count: 2,
    selectionNote: "Writer picks one of two — a real choice, not just random selection. The two topics should represent meaningfully different creative directions.",
    complexityNote: `Both topics should require genuine thought — not just "what do I think?" but "what's the most defensible or interesting position?" They can involve tradeoffs, comparisons, or require the writer to take a non-obvious stance. One topic should feel familiar-but-twisted; the other should feel unexpected. Neither should be answerable with a single observation.`,
    tokenBudget: 650,
    temp: 0.9,
    jsonShape: `{"topics": [
  {"title": "...", "direction": "..."},
  {"title": "...", "direction": "..."}
]}`
  },
  hard: {
    count: 1,
    selectionNote: "One topic. No alternatives. The writer gets what they get.",
    complexityNote: `This is the hardest topic a writer in this domain could face. It should be multi-layered, surprising, and actively resist the obvious answer. Bonus points if the topic could exist at the intersection of this domain and another unexpected field. The direction should open doors the writer didn't know existed, not point them down a corridor. A great hard topic makes the writer think: "I don't know where to start — but I really want to figure it out."`,
    tokenBudget: 280,
    temp: 1.05,
    jsonShape: `{"title": "...", "direction": "..."}`
  }
};

/* ============================================================
   TOPIC PROMPT BUILDER
   The actual prompt sent to the model.
   Designed to produce topics that feel authored, not generated.
   ============================================================ */
function buildTopicPrompt(domain, difficulty, durationMinutes, wordGoal, targetDimension) {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const voice = CLUSTER_VOICE[domain.cluster] || CLUSTER_VOICE.culture;

  // --- Archetype-aware targeting block ---
  let targetingBlock = "";
  if (targetDimension && DIMENSION_TARGETING[targetDimension.key]) {
    const t = DIMENSION_TARGETING[targetDimension.key];
    targetingBlock = `
── CALIBRATION LAYER (invisible to the writer) ──
This writer's weakest dimension is "${t.label}" (avg ${targetDimension.avgScore}/100 over recent sessions).
Without mentioning it in the topic text, engineer the topic so that ${t.label.toLowerCase()} is what separates a good response from a great one:
${t.instruction}
The writer should experience this as a natural, interesting topic — not a remedial exercise.
─────────────────────────────────────────────────
`;
  }

  // Hard difficulty can roam across all domains — special instruction
  const domainInstruction = difficulty === "hard"
    ? `The topic can come from ${domain.name}, from a completely different domain, or from a surprising collision between the two. Cross-domain surprises are especially welcome here.`
    : `The topic must be unmistakably within ${domain.name}. Someone who reads it with no context should immediately know which domain they're in.`;

  return `You are the creative director of "The Hot Take" — a timed writing app built for Gen-Z writers who want to be challenged, not coddled. Your job is to generate writing topics that feel genuinely authored: specific, opinionated, and impossible to write badly about in an interesting way.

━━━ SESSION CONTEXT ━━━
Domain: ${domain.name}
This domain covers: ${domain.blurb}
Difficulty: ${difficulty.toUpperCase()}
Time limit: ${durationMinutes} min | Word target: ${wordGoal}+ words
Topic count: ${cfg.count} (${cfg.selectionNote})

━━━ DOMAIN VOICE ━━━
Tone: ${voice.tone}
Avoid: ${voice.avoid}
Favor: ${voice.favor}

━━━ DOMAIN SCOPE ━━━
${domainInstruction}
${targetingBlock}
━━━ DIFFICULTY MANDATE ━━━
${cfg.complexityNote}

━━━ WHAT MAKES A GREAT TOPIC ━━━
A great Hot Take topic has three qualities:
1. SPECIFICITY — vague topics produce vague writing. "Social media is bad" is not a topic. "Why Instagram's algorithm actively rewards emotional dysregulation — and why we keep using it anyway" is a topic.
2. TENSION — there should be a real argument lurking inside it. Something to push against, a position to defend, a counterintuitive claim to make.
3. PERSONAL ENTRY POINT — the writer should feel a flicker of "oh I actually have something to say about this" in the first 5 seconds. Even the hard topics should feel personally relevant.

━━━ DIRECTION WRITING RULES ━━━
The direction (2-3 sentences) is a creative brief, not a constraint. It should:
- Open up the topic, not narrow it
- Name the specific angle or tension worth pursuing
- Optionally: hint at what a surprising or great response might include — without writing it
- Sound like a smart editor is handing you a brief, not a teacher giving instructions

━━━ FORMAT RULES ━━━
- Title: under 12 words. No "Write about...", no "Explore...", no "Discuss..." — use active verbs: "Defend", "Explain why", "Make the case that", "Argue whether", "Describe the world where", "Design", "Rank", "Break down"
- No emoji in titles or directions
- No quotation marks around titles
- No hashtags
- Return ONLY valid JSON, no markdown fences:
${cfg.jsonShape}`;
}

/* ============================================================
   PARSE TOPIC RESPONSE
   Shared logic for both Gemini and fallback paths
   ============================================================ */
function parseTopicResponse(raw, difficulty) {
  let jsonString = raw;

  const fenceMatch = raw.match(/[`]{3}(?:json)?\s*([\s\S]*?)[`]{3}/);
  if (fenceMatch) {
    jsonString = fenceMatch[1].trim();
  } else {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonString = jsonMatch[0];
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (_) {
    try {
      parsed = JSON.parse(raw);
    } catch (__) {
      console.error("Raw response (parse failed):", raw);
      throw new GeminiError("Couldn't parse the topic response as JSON. Retrying may help.", "parse");
    }
  }

  if (difficulty === "easy" || difficulty === "medium") {
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter(t => t && t.title && t.direction)
      : [];
    const expected = difficulty === "easy" ? 4 : 2;
    if (topics.length < expected) {
      throw new GeminiError(`Only ${topics.length} valid topics returned, expected ${expected}. Retrying may help.`, "empty");
    }
    return { type: "choice", topics };
  } else {
    if (!parsed.title || !parsed.direction) {
      throw new GeminiError("Incomplete topic returned. Retrying may help.", "empty");
    }
    return { type: "single", topic: parsed.title, direction: parsed.direction };
  }
}

/* ============================================================
   MAIN EXPORT — generateTopic
   Tries Gemini first, falls back to Groq 70b on any failure
   ============================================================ */
async function generateTopic(domain, difficulty, durationMinutes, wordGoal, targetDimension) {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const prompt = buildTopicPrompt(domain, difficulty, durationMinutes, wordGoal, targetDimension);

  // ── Attempt 1: Gemini ──
  try {
    const raw = await callGemini(prompt, {
      temperature: cfg.temp,
      maxOutputTokens: cfg.tokenBudget,
      json: true
    });
    return parseTopicResponse(raw, difficulty);
  } catch (geminiErr) {
    console.warn(`[generateTopic] Gemini failed (${geminiErr.code}): ${geminiErr.message}. Falling back to Groq 70b.`);
  }

  // ── Attempt 2: Groq 70b fallback ──
  try {
    const raw = await callGroqFallback(prompt, {
      temperature: Math.min(cfg.temp, 1.0), // Groq doesn't support >1.0
      maxOutputTokens: cfg.tokenBudget
    });
    return parseTopicResponse(raw, difficulty);
  } catch (groqErr) {
    console.error(`[generateTopic] Groq fallback also failed: ${groqErr.message}`);
    throw new GeminiError("Both topic generators are down. Please try again in a moment.", "all-failed");
  }
}