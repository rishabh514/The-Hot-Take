/* ============================================================
   THE HOT TAKE - Groq API wrapper v6
   Model selection:
     - llama-3.3-70b-versatile → deep analysis (best quality)
     - meta-llama/llama-4-scout-17b-16e-instruct → fast tasks
   ============================================================ */

const GROQ_MODEL_ANALYSIS = "llama-3.3-70b-versatile";
const GROQ_MODEL_FAST = "meta-llama/llama-4-scout-17b-16e-instruct";

class GroqError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GroqError";
    this.code = code || "unknown";
  }
}

async function callGroq(prompt, { model = GROQ_MODEL_ANALYSIS, temperature = 0.3, maxOutputTokens = 1024,
    json = false } = {}) {
  
  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature,
    max_tokens: maxOutputTokens,
    ...(json ? { response_format: { type: "json_object" } } : {})
  };

  let response;
  try {
    response = await fetch('/api/groq', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new GroqError("Network error reaching the server. Check your connection.", "network");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || "";
    } catch (_) {}

    if (response.status === 401) {
      throw new GroqError("Server API key is invalid. Check Vercel Environment Variables.", "bad-key");
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
   ANALYSIS PROMPT v2
   
   Core philosophy:
   - Every feedback statement MUST anchor to exact text
   - Archetype assignment is earned through score pattern, not vibes
   - Fix suggestions are rewrites of actual phrases, not abstract advice
   - Overall feedback density scaled to word count (no padding for short pieces)
   - Calibration is tight: 80+ is rare, 60–79 is real accomplishment
   ============================================================ */

// Per-dimension scoring anchors — these live in the prompt to prevent score inflation
const DIMENSION_ANCHORS = {
  structural_clarity: `
    SCORING GUIDE (timed writing context — not a polished draft):
    - 75–100: The reader can follow the argument without getting lost. Paragraphs connect. There's a beginning, middle, and end that feel intentional. Transitions exist.
    - 55–74: A clear main idea runs through it, even if one section wobbles or the ending is abrupt. The reader knows what the writer was trying to do.
    - 35–54: Ideas are present but the order feels accidental. Paragraphs could be rearranged without changing much. The reader has to do work to follow.
    - 15–34: Jumps between unconnected points. Starts somewhere, ends somewhere else, no visible thread.
    - 0–14: Stream-of-consciousness with no navigable structure, or abandoned mid-thought.`,

  cognitive_depth: `
    SCORING GUIDE (timed writing context — not a polished draft):
    - 75–100: Goes beyond stating the obvious. At least one moment where the writer analyzes, compares, challenges an assumption, or draws a non-surface conclusion. Reader learns something or sees something differently.
    - 55–74: More than pure description — there's a "so what" somewhere in the piece, even if it's underdeveloped.
    - 35–54: Mostly describes what already exists. Ideas are named but not developed. "X is a problem" with no explanation of why or what that reveals.
    - 15–34: Restates the topic back as the argument. Could have been written without thinking about it first.
    - 0–14: Filler, copied framing, or zero engagement with the actual topic.`,

  original_synthesis: `
    SCORING GUIDE (timed writing context — not a polished draft):
    - 75–100: Something in here the reader wouldn't have predicted. A personal angle, an unexpected connection, a specific example that's not the first one anyone would reach for. Voice is present.
    - 55–74: Not the completely default take. There's at least one moment where the writer made a choice instead of going on autopilot.
    - 35–54: The obvious take, executed competently. Nothing wrong with it, nothing surprising about it.
    - 15–34: Generic framing, the most predictable examples, no distinguishing moves anywhere in the piece.
    - 0–14: Could be about any topic. No voice, no angle, no individual perspective.`,

  rhetorical_power: `
    SCORING GUIDE (timed writing context — not a polished draft):
    - 75–100: Has a position and fights for it. The reader feels some pull — emotional, logical, or both. Stakes are clear. Not just informative.
    - 55–74: Takes a side and mostly holds it. Some persuasive force even if the argument isn't airtight.
    - 35–54: Has an implied position but doesn't really argue for it. More "here are some thoughts" than "here's why I'm right."
    - 15–34: Position unclear or abandoned halfway. Hedged to the point of incoherence.
    - 0–14: No discernible argument. Reader doesn't know what to think when finished.`,

  metacognitive_awareness: `
    SCORING GUIDE (timed writing context — not a polished draft):
    - 75–100: The writer knows what they're claiming and shows it. Confidence where earned, qualification where honest. Not overconfident, not drowning in hedges.
    - 55–74: At least one moment of real self-awareness — an honest qualification, an acknowledged limit, or a claim the writer clearly thought about before making.
    - 35–54: Either overconfident (states everything as fact with no grounding) or underconfident (so many "maybe"s that no claim lands). Doesn't seem aware of which one.
    - 15–34: No signal that the writer has thought about the reliability of their own claims.
    - 0–14: Completely disconnected from what they're actually asserting.`
};

function buildAnalysisPrompt(userText, domainName, topic, topicDirection, isFreeWrite) {
  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length;
  
  // Scale feedback density to word count
  const isShortPiece = wordCount < 80;
  const quoteLengthGuidance = isShortPiece
    ? "For short pieces: quotes may be whole sentences since the text is brief. Don't over-fragment."
    : "Pull specific phrases (5-20 words), not full paragraphs. Be surgical.";

  let context;
  if (isFreeWrite) {
    context = `Mode: Free Write (no assigned topic — infer intent from the text itself)`;
  } else {
    context = `Domain: ${domainName}
Assigned topic: "${topic}"
Topic direction: "${topicDirection || 'none'}"`;
  }

  return `You are the sharpest writing analyst in the room — part developmental editor, part cognitive scientist, part sparring partner. The writer you're analyzing chose to use a timed writing app. They're not here for compliments. They want to understand exactly why their writing is at the level it's at and what to do next.

Your job: make every sentence of your analysis feel like it could only have been written about *this* piece.

${context}
Word count: ${wordCount}

━━━ THE WRITER'S TEXT ━━━
${userText}
━━━ END OF TEXT ━━━

${quoteLengthGuidance}

══════════════════════════════════════
SCORING — 5 DIMENSIONS
══════════════════════════════════════
Score each dimension 0–100 based purely on what you read. Do not default to any range. Score what you see.

CALIBRATION PRINCIPLE — think like a human editor who has read 500 timed writing pieces:
- Someone who writes coherently, takes a clear position, and has at least one non-obvious idea should score 60–72 overall. This is the honest middle — not a gift, not a punishment.
- Someone who does all of the above AND has a surprising move, a strong voice, or a genuinely well-argued case should score 72–82.
- Someone writing filler, restating the topic, or producing incoherent text should score below 40.
- 85+ requires something genuinely impressive across multiple dimensions simultaneously — rare but real.
- A score of 50 is not "bad." It means the writing is developing. A score of 65 is solid. Treat them accordingly.

The goal is accuracy, not encouragement and not punishment. A writer who produced good timed writing should feel correctly seen. A writer who produced weak writing should understand exactly why — not feel randomly penalized.

1. STRUCTURAL CLARITY (Schema Theory — how ideas are organized into navigable patterns)
   Evaluates: paragraph architecture, logical flow, transitions, reader orientation${DIMENSION_ANCHORS.structural_clarity}

2. COGNITIVE DEPTH (Bloom's Taxonomy — what level of thinking is happening?)
   Evaluates: analysis vs. description, evidence use, multi-perspective thinking, conceptual development${DIMENSION_ANCHORS.cognitive_depth}

3. ORIGINAL SYNTHESIS (Divergent Thinking — are connections novel or predictable?)
   Evaluates: unexpected angles, personal voice distinctiveness, non-obvious examples, creative reframing${DIMENSION_ANCHORS.original_synthesis}

4. RHETORICAL POWER (Aristotle's Ethos/Pathos/Logos — how compelling and persuasive is this?)
   Evaluates: emotional stakes, logical force, position clarity, whether the reader is moved${DIMENSION_ANCHORS.rhetorical_power}

5. METACOGNITIVE AWARENESS (Flavell — does the writer know what they're claiming and why?)
   Evaluates: intellectual honesty, productive uncertainty, confidence calibration, epistemic signal${DIMENSION_ANCHORS.metacognitive_awareness}

OVERALL SCORE = weighted average: Clarity 20% + Depth 25% + Synthesis 20% + Rhetoric 20% + Metacog 15%
Round to nearest integer.

══════════════════════════════════════
THINKER ARCHETYPE — assign exactly ONE
══════════════════════════════════════
Assignment is determined by the TOP TWO dimension scores. Do not assign based on "general vibe."

- "The Systems Thinker" (🔗) → Structural Clarity + Cognitive Depth are the two highest. Sees the skeleton of ideas. Makes complex things navigable. Risk: can over-engineer simple points into unnecessary scaffolding.
- "The Intuitive Rebel" (⚡) → Original Synthesis + Rhetorical Power are the two highest. Leads with gut and conviction. Ideas arrive with flair. Risk: persuasion without enough grounding.
- "The Deep Diver" (🌊) → Cognitive Depth + Metacognitive Awareness are the two highest. Interrogates ideas from the inside. Earns conclusions slowly. Risk: can lose the reader in the process of thinking.
- "The Connector" (🕸️) → Original Synthesis + Metacognitive Awareness are the two highest. Links domains others miss. Knows the edges of what they know. Risk: connections can feel forced if Structural Clarity is low.
- "The Amplifier" (📢) → Rhetorical Power + Structural Clarity are the two highest. Knows how to land a point. High execution instinct. Risk: persuasion without depth reads as confident emptiness.
- "The Excavator" (⛏️) → Cognitive Depth is clearly highest, but other scores are significantly lower. Deep thinker still finding a communication voice. Highest potential ceiling of any archetype.

The archetype_full_description must reference specific phrases or patterns from this particular text. Generic archetype descriptions are failure mode.

══════════════════════════════════════
PER-DIMENSION OUTPUT — for each of the 5:
══════════════════════════════════════
For each dimension, produce:
- Score (0–100)
- _meaning: 2 sentences. What does THIS score mean for THIS writer? Not what the dimension means in general.
- _quote: A phrase or sentence directly from their text that best illustrates the dimension (for good or for ill). No paraphrasing.
- _fix: One specific, usable rewrite or technique applied to that exact quote/passage. Don't say "try to be more analytical" — show the rewrite or name the exact move.

══════════════════════════════════════
SPELLING/GRAMMAR
══════════════════════════════════════
Find up to 5 real errors. Format exactly: "'error' → 'correction'" (e.g. "'recieve' → 'receive'"). Only include actual errors. Empty array if none.

══════════════════════════════════════
SUMMARY FIELDS
══════════════════════════════════════
top_strength: The single most specific impressive thing about this piece — name the exact passage or move that works.
critical_gap: The single highest-leverage thing to fix — be specific about where in the text it shows up.
next_step: One concrete practice or rewrite exercise they can do today that directly addresses the critical gap. Not advice — an action.

══════════════════════════════════════
OUTPUT — valid JSON only, no markdown
══════════════════════════════════════
{
  "structural_clarity": 0,
  "structural_clarity_meaning": "...",
  "structural_clarity_quote": "...",
  "structural_clarity_fix": "...",

  "cognitive_depth": 0,
  "cognitive_depth_meaning": "...",
  "cognitive_depth_quote": "...",
  "cognitive_depth_fix": "...",

  "original_synthesis": 0,
  "original_synthesis_meaning": "...",
  "original_synthesis_quote": "...",
  "original_synthesis_fix": "...",

  "rhetorical_power": 0,
  "rhetorical_power_meaning": "...",
  "rhetorical_power_quote": "...",
  "rhetorical_power_fix": "...",

  "metacognitive_awareness": 0,
  "metacognitive_awareness_meaning": "...",
  "metacognitive_awareness_quote": "...",
  "metacognitive_awareness_fix": "...",

  "overall_score": 0,

  "archetype_name": "",
  "archetype_icon": "",
  "archetype_full_description": "3-4 sentences referencing this writer's actual text and patterns — not the archetype description copy-pasted.",
  "archetype_thinking_style": "One sentence about how this writer specifically processes and communicates ideas, inferred from patterns in this text.",
  "archetype_ceiling": "One sentence on the specific thing that, if developed, would elevate this writer to the next level.",

  "top_strength": "...",
  "critical_gap": "...",
  "next_step": "...",

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