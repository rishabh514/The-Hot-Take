/* ============================================================
   THE SPITTER - Groq API wrapper v5
   Model selection:
     - llama-3.3-70b-versatile → deep analysis (best quality)
     - meta-llama/llama-4-scout-17b-16e-instruct → fast/cheap tasks
   ============================================================ */

const GROQ_MODEL_ANALYSIS = "llama-3.3-70b-versatile";
const GROQ_MODEL_FAST = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

class GroqError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GroqError";
    this.code = code || "unknown";
  }
}

function getGroqApiKey() {
  return window.__spitterGroqApiKey || "";
}

async function callGroq(prompt, { model = GROQ_MODEL_ANALYSIS, temperature = 0.3, maxOutputTokens = 1024,
    json = false } = {}) {
  const apiKey = getGroqApiKey();
  if (!apiKey || apiKey === "YOUR_GROQ_API_KEY_HERE") {
    throw new GroqError("No Groq API key configured. Check config.js.", "no-key");
  }

  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature,
    max_tokens: maxOutputTokens,
    ...(json ? { response_format: { type: "json_object" } } : {})
  };

  let response;
  try {
    response = await fetch(GROQ_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new GroqError("Network error reaching Groq. Check your connection.", "network");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || "";
    } catch (_) {}

    if (response.status === 401) {
      throw new GroqError("Groq API key is invalid or not authorized. Check config.js.", "bad-key");
    }
    if (response.status === 429) {
      throw new GroqError("Rate limited by Groq. Wait a moment and retry.", "rate-limit");
    }
    throw new GroqError(detail || `Groq request failed (${response.status}).`, "http-" + response.status);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";

  if (!text) {
    throw new GroqError("Groq returned an empty response.", "empty");
  }

  return text.trim();
}

/* ============================================================
   ANALYSIS PROMPT - Psychology-backed, text-referencing,
   deeply actionable, dimension-complete
   ============================================================ */

function buildAnalysisPrompt(userText, domainName, topic, topicDirection, isFreeWrite) {
  let context = `Domain: ${domainName}\n`;
  if (isFreeWrite) {
    context += `The user chose free writing. No topic was assigned. Infer their intent from the text.\n`;
  } else {
    context += `Assigned topic: "${topic}"\nTopic direction: "${topicDirection || 'none'}"\n`;
  }

  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length;

  return `You are a world-class cognitive writing analyst - part psychologist, part editor, part writing coach. Your job is to give a writer the most precise, actionable, text-grounded analysis they've ever received. Every claim you make MUST reference specific words, phrases, or passages from their text.

${context}
Word count: ${wordCount}

THE WRITER'S TEXT (analyze this carefully - quote from it directly):
---
${userText}
---

You will score 5 psychology-backed dimensions. For EACH dimension, provide:
1. A score out of 100
2. A "what this score means" explanation (2 sentences, concrete)
3. A "quote_example" - pull an actual phrase/sentence from their text that illustrates this dimension (good OR bad)
4. A "precise_fix" - one SPECIFIC, actionable rewrite or technique they could have applied to that exact passage

THE 5 DIMENSIONS (psychology-rooted, not vague):

1. STRUCTURAL CLARITY (based on Schema Theory - how well your thinking is organized into recognizable patterns)
   Score reflects: paragraph flow, logical transitions, argument scaffolding, reader orientation
   
2. COGNITIVE DEPTH (based on Bloom's Taxonomy - are you describing, analyzing, evaluating, or creating?)
   Score reflects: use of evidence, nuance, multi-perspective thinking, conceptual layering
   
3. ORIGINAL SYNTHESIS (based on Divergent Thinking research - are you connecting ideas in novel ways?)
   Score reflects: unexpected angles, personal voice, creative metaphors, non-obvious connections
   
4. RHETORICAL POWER (based on Aristotle's Ethos/Pathos/Logos - how persuasive and compelling is this?)
   Score reflects: emotional resonance, credibility signals, logical force, engagement hooks
   
5. METACOGNITIVE AWARENESS (based on Flavell's metacognition model - do you know what you think AND why?)
   Score reflects: self-awareness in writing, nuance about own claims, intellectual honesty, epistemic confidence

THINKER ARCHETYPES (assign ONE based on the dimension scores. These must feel accurate, not generic):

- "The Systems Thinker" (🔗) - High Structural Clarity + Cognitive Depth. You see the skeleton of ideas. You naturally structure complex info but may over-engineer simple points.
- "The Intuitive Rebel" (⚡) - High Original Synthesis + Rhetorical Power. You lead with gut and flair. Your ideas feel fresh but sometimes lack grounding.
- "The Deep Diver" (🌊) - High Cognitive Depth + Metacognitive Awareness. You interrogate ideas from the inside. You're nuanced but can lose the reader in abstraction.
- "The Connector" (🕸️) - High Original Synthesis + Metacognitive Awareness. You link domains others miss. Risk: connections can feel forced without Structural Clarity.
- "The Amplifier" (📢) - High Rhetorical Power + Structural Clarity. You know how to land a point. Risk: persuasion without depth can feel hollow.
- "The Excavator" (⛏️) - High Cognitive Depth only, other scores lower. You think deeply but haven't found your communication voice yet. High ceiling.

SCORING GUIDE - be calibrated, not generous:
- 80-100: Genuinely exceptional. Most timed writing never reaches here.
- 60-79: Strong with clear intent. Above average.
- 40-59: Developing. Ideas present but craft is inconsistent.
- 20-39: Early stage. Potential visible but execution fragmented.
- 0-19: Minimal - very short text, stream-of-consciousness, or disconnected thoughts.

OVERALL SCORE = weighted average: Clarity 20% + Depth 25% + Synthesis 20% + Rhetoric 20% + Metacog 15%

SPELLING/GRAMMAR: Identify up to 5 real errors with exact text. Format: "'misspeled' → 'misspelled'"

Return ONLY a valid JSON object. No markdown fences. No extra text. Exact shape:
{
  "structural_clarity": 0,
  "structural_clarity_meaning": "What this score means for this writer.",
  "structural_clarity_quote": "exact phrase or sentence from their text",
  "structural_clarity_fix": "Specific rewrite or technique for that exact passage",

  "cognitive_depth": 0,
  "cognitive_depth_meaning": "What this score means for this writer.",
  "cognitive_depth_quote": "exact phrase or sentence from their text",
  "cognitive_depth_fix": "Specific rewrite or technique for that exact passage",

  "original_synthesis": 0,
  "original_synthesis_meaning": "What this score means for this writer.",
  "original_synthesis_quote": "exact phrase or sentence from their text",
  "original_synthesis_fix": "Specific rewrite or technique for that exact passage",

  "rhetorical_power": 0,
  "rhetorical_power_meaning": "What this score means for this writer.",
  "rhetorical_power_quote": "exact phrase or sentence from their text",
  "rhetorical_power_fix": "Specific rewrite or technique for that exact passage",

  "metacognitive_awareness": 0,
  "metacognitive_awareness_meaning": "What this score means for this writer.",
  "metacognitive_awareness_quote": "exact phrase or sentence from their text",
  "metacognitive_awareness_fix": "Specific rewrite or technique for that exact passage",

  "overall_score": 0,

  "archetype_name": "",
  "archetype_icon": "",
  "archetype_full_description": "3-4 sentences that feel personal and accurate - reference what they actually wrote. Why THIS archetype for THIS writer.",
  "archetype_thinking_style": "One precise sentence about how they process and communicate ideas, based on patterns in their text.",
  "archetype_ceiling": "One sentence on what they could become if they developed their gaps.",

  "top_strength": "The single most impressive thing about this writing - be specific and reference their text.",
  "critical_gap": "The single most impactful thing they can work on - be specific and reference their text.",
  "next_step": "One concrete writing exercise or technique they can practice TODAY to address the critical gap.",

  "spelling_errors": []
}`;
}

async function analyzeContentWithGroq(userText, domainName, topic, topicDirection, isFreeWrite) {
  const prompt = buildAnalysisPrompt(userText, domainName, topic, topicDirection, isFreeWrite);
  const raw = await callGroq(prompt, {
    model: GROQ_MODEL_ANALYSIS,
    temperature: 0.2,
    maxOutputTokens: 1800,
    json: true
  });

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonString = jsonMatch ? jsonMatch[0] : raw;
  try {
    return JSON.parse(jsonString);
  } catch (_) {
    throw new GroqError("Couldn't parse the analysis Groq sent back.", "parse");
  }
}