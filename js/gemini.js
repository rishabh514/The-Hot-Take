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
    tone: "irreverent, chronically online, aware of irony — think someone who grew up on Instagram Reels and Twitter/X doomscrolling",
    avoid: "Western-only references, explaining context most Indian Gen-Z already knows, overly academic framing",
    favor: "takes that would blow up in a college WhatsApp group or get ratio'd on Twitter India, desi internet culture, Bollywood vs. Hollywood tension, the specific chaos of being online in India right now"
  },
  lifestyle: {
    tone: "personal, grounded, experiential — like a smart friend at a Delhi café who actually has opinions",
    avoid: "self-help speak, vague wellness language, generic backpacker travel clichés written for a Western audience",
    favor: "topics rooted in the Indian middle-class experience — the pressure of family expectations, food nostalgia tied to specific cities or festivals, the gap between how people live and what they post, travel that includes Goa, Himachal, or Southeast Asia on a budget"
  },
  mind: {
    tone: "honest, a little uncomfortable, psychologically sharp — aware of the specific Indian context of mental health stigma and hustle pressure",
    avoid: "TED talk framing, therapy speak borrowed wholesale from American self-help, anything that ignores the desi family/society dynamic",
    favor: "topics that name the specific pressures Indian young adults face — parental approval, arranged marriage vs. love marriage, log kya kahenge, FOMO in a country where comparison is inescapable"
  },
  hustle: {
    tone: "skeptical of hype, builder-brained, aware of both the startup ecosystem and the IIT/IIM pipeline pressure",
    avoid: "Silicon Valley guru language, advice that assumes the writer is in the US, broad platitudes about 'the future of work'",
    favor: "topics grounded in the Indian hustle reality — Tier 1 vs Tier 2 city ambition gaps, the startup vs. corporate job debate, whether the MBA is still worth it, the specific economics of building for Bharat vs. building for metros"
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

━━━ AUDIENCE CONTEXT ━━━
Primary audience: Indian Gen-Z and young millennials (18–28). Metro and Tier-1 cities primarily, but aspirationally aware of Tier-2 reality. English-comfortable but code-switches naturally. Heavily online across Instagram, YouTube, Twitter/X, and Reddit India.

WHAT "RELEVANT" MEANS FOR THIS AUDIENCE:
This is not a generic "Indian youth" audience. These are people who simultaneously:
- Follow IPL and also watch Premier League
- Watch Bollywood AND Hollywood AND anime AND Korean dramas
- Complain about UPSC pressure and also debate which startup to join
- Know what "bhai seedha point pe aa" means AND get the reference when someone quotes The Office
- Are deeply aware of the India-specific version of every global trend: not just "hustle culture" but "IIT grind culture"; not just "therapy" but "ek baar psychiatrist ke paas gaya toh society kya bolegi"

REFERENCE FILTER — use this to decide if a reference belongs:
✓ Include: things that have been memed, debated, or gone viral specifically within Indian internet culture — whether that originated in India or was adapted from global content
✓ Include: experiences tied to the Indian urban young adult life arc — board exams, JEE/NEET pressure, college fests, internship grind, family dinner arguments, shaadi season stress, moving to a new city for work
✓ Include: global trends that have a distinct Indian flavor or caused specific Indian discourse (e.g. a global AI tool that became a UPSC debate, a Netflix show that caused a desi Twitter war, a fitness trend that got localized)
✗ Exclude: references that only landed in the US/UK and never generated Indian discourse
✗ Exclude: hyper-niche subcultures that even chronically online Indian Gen-Z wouldn't recognize

TOPIC FRAMING PRINCIPLE:
When a topic could be framed generically global OR with a specific Indian tension — always pick the Indian tension. "Is hustle culture toxic?" is a generic topic. "Is the IIT-to-startup pipeline just a more socially acceptable version of the same pressure we were supposed to escape?" is a Hot Take topic for this audience.

The best topics will make someone think: "yaar this is literally my life / my college / my WhatsApp group" — even if the domain is gaming, fashion, or philosophy.

━━━ WHAT MAKES A GREAT TOPIC ━━━
A great Hot Take topic has three qualities:

1. SPECIFICITY — vague topics produce vague writing.
   Bad: "Social media is bad"
   Bad: "India has a mental health problem"
   Good: "Why Instagram's algorithm rewards emotional dysregulation — and why we keep using it anyway"
   Good: "Why Indian parents calling therapy 'timepass' isn't ignorance — it's a survival strategy that worked for them"

2. TENSION — there should be a real argument lurking inside it. Something to push against, a position to defend, a counterintuitive claim. The topic should make it possible to write a genuinely wrong answer, not just a weak one.

3. PERSONAL ENTRY POINT — the writer should feel "yaar I actually have something to say about this" within 5 seconds. The topic doesn't need to be autobiographical, but it must feel like it lives in their world, not a textbook.

━━━ DIRECTION WRITING RULES ━━━
The direction (2-3 sentences) is a creative brief, not a constraint. It should:
- Open up the topic, not narrow it — give the writer a lens, not a script
- Name the specific tension or angle worth pursuing
- Optionally hint at what a surprising or honest response might explore — without writing it for them
- Sound like a sharp editor handing you a brief at 11pm, not a professor writing an exam question
- Never use phrases like "consider how...", "reflect on...", "think about..." — those are academic. Use: "The real argument here is...", "Most people will say X — the interesting take is...", "Don't just describe it — pick a side."

━━━ FORMAT RULES ━━━
- Title: under 12 words. Punchy, specific, opinionated.
- Lead with active verbs: "Defend", "Explain why", "Make the case that", "Argue whether", "Describe the world where", "Rank", "Break down", "Diagnose"
- No "Write about...", "Explore...", "Discuss...", "Examine..."
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