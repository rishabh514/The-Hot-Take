/* ============================================================
   THE HOT TAKE - App logic v5.1
   ============================================================ */
(function() {
  "use strict";

  /* ---------------- State ---------------- */
  const state = {
    domain: null,
    difficulty: null,
    duration: null,
    wordGoal: null,
    direction: null,
    topic: null,
    topicOptions: null,
    isFreeWrite: false,
    effectiveDomain: null,

    startedAt: null,
    text: "",
    wordCount: 0,
    pauses: 0,
    pauseEvents: [],
    timeRemaining: 0,
    timerId: null,
    pauseTimerId: null,
    lastKeystroke: null,
    completed: false,
    timeSpent: 0,

    analysis: null,
    history: [],
    streak: 0,
    targetDimension: null
  };

  const PAUSE_LIMIT_MS = 4000;
  const HISTORY_KEY = "spitter_history_v5";
  const STREAK_KEY = "spitter_streak_v5";

  const DIFFICULTY_CONFIG = {
    easy: { duration: 3, wordGoal: 150, label: "mild" },
    medium: { duration: 5, wordGoal: 250, label: "medium" },
    hard: { duration: 8, wordGoal: 400, label: "unhinged" }
  };

  /* ---------------- Tiers ---------------- */
  const TIERS = [
    {
      max: 20, name: "Raw Signal", icon: "📡",
      description: "Your thoughts are broadcasting but the signal is faint. You've started - that's the hardest part. Every expert writer was here once.",
      color: "#888"
    },
    {
      max: 40, name: "Finding Voice", icon: "🌱",
      description: "Your ideas are taking shape. You have something to say but the execution is still rough at the edges. This is where most people quit - keep going.",
      color: "#aad900"
    },
    {
      max: 60, name: "Sharp Mind", icon: "⚡",
      description: "Your thinking is clear and your structure is forming. You're writing with intent. People in this tier often surprise themselves.",
      color: "#c8ff00"
    },
    {
      max: 80, name: "The Articulate", icon: "🔮",
      description: "Sophisticated thinker. You use language precisely, argue from evidence, and your writing has a distinct point of view. Top 20% territory.",
      color: "#9f7aea"
    },
    {
      max: 100, name: "Neural Fire", icon: "🧠",
      description: "Rare. Your writing demonstrates mastery of structure, depth, and originality simultaneously. You think in systems and write with clarity. Screenshot this.",
      color: "#ff9f40"
    }
  ];

  function getTier(score) {
    return TIERS.find(t => score <= t.max) || TIERS[TIERS.length - 1];
  }

  function getNextTier(score) {
    for (let i = 0; i < TIERS.length; i++) {
      if (score <= TIERS[i].max) return TIERS[i];
    }
    return TIERS[TIERS.length - 1];
  }

  function getProgressToNext(score) {
    const current = getTier(score);
    const idx = TIERS.indexOf(current);
    const prev = idx > 0 ? TIERS[idx - 1].max : 0;
    const range = current.max - prev;
    const progress = ((score - prev) / range) * 100;
    return Math.min(100, Math.max(0, progress));
  }

  /* ---------------- Dimensions definition ---------------- */
  const DIMENSIONS = [
    { key: "structural_clarity", label: "Structural Clarity", icon: "🏗️", theory: "Schema Theory", shortLabel: "Structure", color: "#c8ff00" },
    { key: "cognitive_depth", label: "Cognitive Depth", icon: "🔭", theory: "Bloom's Taxonomy", shortLabel: "Depth", color: "#9f7aea" },
    { key: "original_synthesis", label: "Original Synthesis", icon: "✨", theory: "Divergent Thinking", shortLabel: "Originality", color: "#ff9f40" },
    { key: "rhetorical_power", label: "Rhetorical Power", icon: "🎙️", theory: "Aristotle's Rhetoric", shortLabel: "Rhetoric", color: "#38bdf8" },
    { key: "metacognitive_awareness", label: "Metacognitive Awareness", icon: "🧭", theory: "Flavell's Model", shortLabel: "Self-Awareness", color: "#f472b6" }
  ];

  const MOMENTUM_DIM = { key: "momentum_index", label: "Momentum Index", icon: "📈", theory: "Your Rolling Average", shortLabel: "Momentum", color: "#34d399" };

  function getRollingAverage(hist, n = 3) {
    const recent = hist.slice(-n);
    if (recent.length === 0) return null;
    const sums = {};
    DIMENSIONS.forEach(d => { sums[d.key] = 0; });
    recent.forEach(entry => {
      DIMENSIONS.forEach(d => {
        sums[d.key] += (entry.analysis?.[d.key] || 0);
      });
    });
    const avgs = {};
    DIMENSIONS.forEach(d => { avgs[d.key] = sums[d.key] / recent.length; });
    return avgs;
  }

  function computeMomentum(analysis, historyBeforeThisRound) {
    const rollingAvg = getRollingAverage(historyBeforeThisRound, 3);
    if (!rollingAvg) {
      return { available: false, deltas: {}, momentumScore: null, baselineCount: historyBeforeThisRound.length };
    }
    const deltas = {};
    let deltaSum = 0;
    DIMENSIONS.forEach(d => {
      const current = analysis[d.key] || 0;
      const delta = current - rollingAvg[d.key];
      deltas[d.key] = Math.round(delta * 10) / 10;
      deltaSum += delta;
    });
    const avgDelta = deltaSum / DIMENSIONS.length;
    const momentumScore = Math.round(Math.min(100, Math.max(0, 50 + avgDelta * 2.5)));
    return { available: true, deltas, momentumScore, rollingAvg, baselineCount: historyBeforeThisRound.length };
  }

  function getWeakestDimension(hist, n = 5) {
    const recent = hist.slice(-n);
    if (recent.length < 2) return null;
    const avgs = getRollingAverage(recent, recent.length);
    if (!avgs) return null;
    let weakestKey = null;
    let weakestVal = Infinity;
    DIMENSIONS.forEach(d => {
      if (avgs[d.key] < weakestVal) {
        weakestVal = avgs[d.key];
        weakestKey = d.key;
      }
    });
    const dim = DIMENSIONS.find(d => d.key === weakestKey);
    return dim ? { ...dim, avgScore: Math.round(weakestVal) } : null;
  }

  function getHistoricalPauseStats(hist) {
    const allPauseEvents = [];
    hist.forEach(entry => {
      (entry.pauseEvents || []).forEach(ev => allPauseEvents.push(ev));
    });
    if (allPauseEvents.length === 0) return null;

    const avgWordCountAtFirstPause = (() => {
      const firsts = hist
        .map(e => (e.pauseEvents || [])[0])
        .filter(Boolean)
        .map(ev => ev.wordCount);
      if (firsts.length === 0) return null;
      return Math.round(firsts.reduce((a, b) => a + b, 0) / firsts.length);
    })();

    const avgPausesPerSession = (() => {
      const withPauseCounts = hist.map(e => (e.pauseEvents || []).length);
      if (withPauseCounts.length === 0) return null;
      return Math.round((withPauseCounts.reduce((a, b) => a + b, 0) / withPauseCounts.length) * 10) / 10;
    })();

    return { avgWordCountAtFirstPause, avgPausesPerSession, totalSessions: hist.length };
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const screensEl = $("#screens");
  const announcer = $("#srAnnouncer");

  function announce(msg) {
    if (!announcer) return;
    announcer.textContent = "";
    requestAnimationFrame(() => { announcer.textContent = msg; });
  }

  function showScreen(name) {
    $$(".screen").forEach((s) => s.classList.toggle("is-active", s.dataset.screen === name));
    if (screensEl) screensEl.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    
    document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
    const activeLink = document.querySelector(`.nav-link[data-screen="${name}"]`);
    if (activeLink) activeLink.classList.add("active");
  }

  $$("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.back));
  });

  function getDomainById(id) { return DOMAINS.find(d => d.id === id) || null; }
  function pickRandomDomain() { return DOMAINS[Math.floor(Math.random() * DOMAINS.length)]; }

  function loadStreak() {
    try {
      const val = parseInt(localStorage.getItem(STREAK_KEY), 10);
      state.streak = isNaN(val) ? 0 : val;
    } catch (_) { state.streak = 0; }
    updateStreakDisplay();
  }

  function incrementStreak() {
    state.streak += 1;
    localStorage.setItem(STREAK_KEY, String(state.streak));
    updateStreakDisplay();
    if (state.streak >= 3) triggerStreakCelebration();
  }

  function resetStreak() {
    state.streak = 0;
    localStorage.setItem(STREAK_KEY, "0");
    updateStreakDisplay();
  }

  function updateStreakDisplay() {
    const el = $("#streakDisplay");
    const navEl = $("#streakDisplayNav");
    if (el) el.textContent = `🔥 ${state.streak}`;
    if (navEl) navEl.textContent = state.streak;
  }

  function triggerStreakCelebration() {
    const el = $("#streakDisplay");
    if (el) {
      el.classList.add("streak--fire");
      setTimeout(() => el.classList.remove("streak--fire"), 1000);
    }
  }

  /* ================================================================
     SCREEN 0 - DOMAIN SELECT
  ================================================================ */

  const domainGrid = $("#domainGrid");
  const aiDecideBtn = $("#aiDecideBtn");
  const startGameBtn = $("#startGameBtn");

  function renderDomainGrid() {
    if (!domainGrid) return;
    const order = ["culture", "lifestyle", "mind", "hustle"];
    let html = "";
    order.forEach((cluster) => {
      DOMAINS.filter((d) => d.cluster === cluster).forEach((d) => {
        html += `
          <button type="button" class="domain-card" data-domain="${d.id}" role="option" aria-selected="false">
            <span class="domain-card__icon">${d.icon}</span>
            <span class="domain-card__name">${d.name}</span>
            <span class="domain-card__short">${d.short}</span>
          </button>`;
      });
    });
    domainGrid.innerHTML = html;

    $$(".domain-card").forEach((card) => {
      card.addEventListener("click", () => {
        selectDomain(card.dataset.domain);
      });
    });
  }

  function selectDomain(domainId) {
    $$(".domain-card").forEach((c) => {
      c.classList.remove("is-selected");
      c.setAttribute("aria-selected", "false");
    });
    const card = $$(".domain-card").find(c => c.dataset.domain === domainId);
    if (card) {
      card.classList.add("is-selected");
      card.setAttribute("aria-selected", "true");
      state.domain = getDomainById(domainId);
    }
    if (startGameBtn) startGameBtn.disabled = false;
  }

  function highlightRandomDomainCard() {
    const allCards = $$(".domain-card");
    allCards.forEach(c => {
      c.classList.remove("is-selected");
      c.setAttribute("aria-selected", "false");
    });
    let flashes = 0;
    const totalFlashes = 12;
    const finalIndex = Math.floor(Math.random() * allCards.length);
    let currentFlash = Math.floor(Math.random() * allCards.length);

    const interval = setInterval(() => {
      allCards.forEach(c => c.classList.remove("is-selected"));
      allCards[currentFlash].classList.add("is-selected");
      currentFlash = (currentFlash + 1) % allCards.length;
      flashes++;
      if (flashes >= totalFlashes) {
        clearInterval(interval);
        allCards.forEach(c => {
          c.classList.remove("is-selected");
          c.setAttribute("aria-selected", "false");
        });
        allCards[finalIndex].classList.add("is-selected");
        allCards[finalIndex].setAttribute("aria-selected", "true");
        allCards[finalIndex].scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 80);
  }

  if (aiDecideBtn) {
    aiDecideBtn.addEventListener("click", () => {
      const randomDomain = pickRandomDomain();
      state.domain = { ...randomDomain, isRandom: true };
      highlightRandomDomainCard();
      if (startGameBtn) startGameBtn.disabled = false;
    });
  }

  if (startGameBtn) {
    startGameBtn.addEventListener("click", () => {
      if (!state.domain) return;
      showScreen("difficulty");
    });
  }

  renderDomainGrid();

  /* ================================================================
     SCREEN 1 - DIFFICULTY SELECT
  ================================================================ */

  const diffList = $("#diffList");
  const toTopicBtn = $("#toTimeBtn");

  if (toTopicBtn) {
    toTopicBtn.innerHTML = `<span>generate topic</span><span class="cta-btn__arrow">→</span>`;
  }

  $$(".diff-card", diffList).forEach((card) => {
    card.addEventListener("click", () => {
      $$(".diff-card", diffList).forEach((c) => {
        c.classList.remove("is-selected");
        c.setAttribute("aria-selected", "false");
      });
      card.classList.add("is-selected");
      card.setAttribute("aria-selected", "true");
      state.difficulty = card.dataset.diff;
      const config = DIFFICULTY_CONFIG[state.difficulty];
      state.duration = config.duration;
      state.wordGoal = config.wordGoal;
      if (toTopicBtn) toTopicBtn.disabled = false;
    });
  });

  if (toTopicBtn) {
    toTopicBtn.addEventListener("click", () => {
      showScreen("topic");
      runTopicGeneration();
    });
  }

  /* ================================================================
     SCREEN 3 - TOPIC GENERATION
  ================================================================ */

  const topicLoading = $("#topicLoading");
  const topicError = $("#topicError");
  const topicErrorMsg = $("#topicErrorMsg");
  const topicSingle = $("#topicSingle");
  const topicSingleText = $("#topicSingleText");
  const topicSingleDirection = $("#topicSingleDirection");
  const topicChoice = $("#topicChoice");
  const topicChoiceGrid = $("#topicChoiceGrid");
  const loaderText = $("#loaderText");

  const LOADER_PHRASES = [
    "cooking up your topic…",
    "rattling the idea generator…",
    "asking the bar what it wants…",
    "summoning something unhinged…",
    "negotiating with the model…"
  ];

  function setTopicView(view) {
    if (topicLoading) topicLoading.hidden = view !== "loading";
    if (topicError) topicError.hidden = view !== "error";
    if (topicSingle) topicSingle.hidden = view !== "single";
    if (topicChoice) topicChoice.hidden = view !== "choice";
  }

  async function runTopicGeneration() {
    setTopicView("loading");
    if (loaderText) loaderText.textContent = LOADER_PHRASES[Math.floor(Math.random() * LOADER_PHRASES.length)];

    const effectiveDomain = (state.domain.isRandom || state.difficulty === "hard") ?
      pickRandomDomain() : state.domain;
    state.effectiveDomain = effectiveDomain;

    const hist = getHistory();
    const target = getWeakestDimension(hist, 5);
    state.targetDimension = target;

    try {
      const result = await generateTopic(effectiveDomain, state.difficulty, state.duration, state.wordGoal, target);
      if (result.type === "single") {
        state.topic = result.topic;
        state.direction = result.direction;
        state.topicOptions = null;
        state.isFreeWrite = false;
        if (topicSingleText) topicSingleText.textContent = result.topic;
        if (topicSingleDirection) topicSingleDirection.textContent = result.direction;
        renderTargetBanner();
        setTopicView("single");
      } else {
        state.topic = null;
        state.direction = null;
        state.topicOptions = result.topics;
        state.isFreeWrite = false;
        renderTopicChoices(result.topics);
        renderTargetBanner();
        setTopicView("choice");
      }
    } catch (err) {
      console.error(err);
      handleTopicFailure(err, effectiveDomain);
    }
  }

  function renderTargetBanner() {
    const singleBanner = $("#targetBannerSingle");
    const choiceBanner = $("#targetBannerChoice");
    [singleBanner, choiceBanner].forEach(el => { if (el) el.hidden = true; });

    if (!state.targetDimension) return;
    const t = state.targetDimension;
    const html = `<span class="target-banner__icon">🎯</span> Today's topic is calibrated to push your <strong>${t.label}</strong> - it's been averaging ${t.avgScore}/100 over your last few rounds.`;
    if (singleBanner) { singleBanner.innerHTML = html; singleBanner.hidden = false; }
    if (choiceBanner) { choiceBanner.innerHTML = html; choiceBanner.hidden = false; }
  }

  function handleTopicFailure(err, effectiveDomain) {
    const msg = err.message || "Something went wrong generating a topic.";
    if (topicErrorMsg) topicErrorMsg.textContent = msg + " Tap retry to try again.";

    const fallbackPool = effectiveDomain.fallback || [
      "Write about a moment that changed how you see the world.",
      "Argue for or against a belief you once held strongly.",
      "Describe a place that no longer exists but lives in your memory."
    ];
    const fallbackTopic = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];

    const retryBtn = $("#retryTopicBtn");
    if (retryBtn) retryBtn.textContent = "retry Gemini";

    let fallbackBtn = $("#useFallbackBtn");
    if (!fallbackBtn) {
      fallbackBtn = document.createElement("button");
      fallbackBtn.id = "useFallbackBtn";
      fallbackBtn.type = "button";
      fallbackBtn.className = "ghost-btn";
      fallbackBtn.style.marginTop = "12px";
      if (retryBtn) retryBtn.insertAdjacentElement("afterend", fallbackBtn);
    }
    if (fallbackBtn) {
      fallbackBtn.textContent = "use a backup topic instead";
      fallbackBtn.onclick = () => {
        state.topic = fallbackTopic;
        state.direction = "(backup topic)";
        state.topicOptions = null;
        state.isFreeWrite = false;
        if (topicSingleText) topicSingleText.textContent = fallbackTopic;
        if (topicSingleDirection) topicSingleDirection.textContent = "Write freely on this topic. The bar is yours.";
        setTopicView("single");
      };
    }
    setTopicView("error");
  }

  const retryBtn = $("#retryTopicBtn");
  if (retryBtn) retryBtn.addEventListener("click", () => runTopicGeneration());

  function renderTopicChoices(topics) {
    if (!topicChoiceGrid) return;
    topicChoiceGrid.innerHTML = topics.map((t, i) => `
      <button type="button" class="topic-option" data-idx="${i}">
        <span class="topic-option__num">0${i + 1}</span>
        <span class="topic-option__title">${escapeHtml(t.title)}</span>
        <p class="topic-option__direction">${escapeHtml(t.direction)}</p>
      </button>
    `).join("");

    $$(".topic-option", topicChoiceGrid).forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = topics[Number(btn.dataset.idx)];
        state.topic = choice.title;
        state.direction = choice.direction;
        state.isFreeWrite = false;
        beginWriting();
      });
    });
  }

  const freeWriteSingle = $("#freeWriteFromSingleBtn");
  if (freeWriteSingle) {
    freeWriteSingle.addEventListener("click", () => {
      state.isFreeWrite = true;
      state.topic = null;
      state.direction = null;
      beginWriting();
    });
  }

  const freeWriteChoice = $("#freeWriteFromChoiceBtn");
  if (freeWriteChoice) {
    freeWriteChoice.addEventListener("click", () => {
      state.isFreeWrite = true;
      state.topic = null;
      state.direction = null;
      beginWriting();
    });
  }

  const startWritingBtn = $("#startWritingBtn");
  if (startWritingBtn) startWritingBtn.addEventListener("click", beginWriting);

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ================================================================
     SCREEN 4 - WRITING ARENA
  ================================================================ */

  const writeArea = $("#writeArea");
  const hudTopic = $("#hudTopic");
  const hudDirectionWrap = $("#hudDirectionWrap");
  const hudClock = $("#hudClock");
  const hudWordCount = $("#hudWordCount");
  const hudWordGoal = $("#hudWordGoal");
  const healthbarFill = $("#healthbarFill");
  const hudWPM = $("#hudWPM");
  const hudPauseIndicator = $("#hudPauseIndicator");
  const staticWipe = $("#staticWipe");
  const wipeToast = $("#wipeToast");

  function beginWriting() {
    state.text = "";
    state.wordCount = 0;
    state.pauses = 0;
    state.pauseEvents = [];
    state.completed = false;
    state.timeRemaining = state.duration * 60;
    state.startedAt = Date.now();

    if (writeArea) writeArea.value = "";

    if (state.isFreeWrite) {
      if (hudTopic) hudTopic.textContent = `✏️ Free Write - ${state.effectiveDomain.name}`;
      if (hudDirectionWrap) hudDirectionWrap.hidden = true;
    } else {
      if (hudTopic) hudTopic.textContent = state.topic || "No topic set";
      if (state.direction && hudDirectionWrap) {
        hudDirectionWrap.textContent = state.direction;
        hudDirectionWrap.hidden = false;
      } else if (hudDirectionWrap) {
        hudDirectionWrap.hidden = true;
      }
    }

    if (hudWordGoal) hudWordGoal.textContent = state.wordGoal;
    updateWordCount();
    updateClock();
    if (healthbarFill) {
      healthbarFill.style.width = "100%";
      healthbarFill.classList.remove("healthbar__fill--low");
    }

    showScreen("write");
    setTimeout(() => { if (writeArea) writeArea.focus(); }, 60);

    clearInterval(state.timerId);
    state.timerId = setInterval(tick, 1000);
    resetPauseTimer();
  }

  function tick() {
    state.timeRemaining -= 1;
    updateClock();

    const timeElapsedMinutes = (Date.now() - state.startedAt) / 1000 / 60;
    if (timeElapsedMinutes > 0.05) {
      const wpm = Math.round(state.wordCount / timeElapsedMinutes);
      if (hudWPM) hudWPM.textContent = wpm;
    }

    if (state.timeRemaining <= 0) {
      clearInterval(state.timerId);
      finishRound(false);
    }
  }

  function updateClock() {
    const m = Math.floor(Math.max(0, state.timeRemaining) / 60);
    const s = Math.max(0, state.timeRemaining) % 60;
    if (hudClock) hudClock.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    const totalSecs = state.duration * 60;
    const pct = Math.max(0, (state.timeRemaining / totalSecs) * 100);
    if (healthbarFill) {
      healthbarFill.style.width = pct + "%";
      healthbarFill.classList.toggle("healthbar__fill--low", pct <= 20);
    }
    if (hudClock) hudClock.classList.toggle("hud-clock--low", pct <= 20);
  }

  function countWords(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }

  function updateWordCount() {
    state.wordCount = countWords(state.text);
    if (hudWordCount) hudWordCount.textContent = state.wordCount;
    if (state.wordCount >= state.wordGoal) {
      finishRound(true);
    }
  }

  if (writeArea) {
    writeArea.addEventListener("input", () => {
      state.text = writeArea.value;
      updateWordCount();
      registerKeystroke();
    });

    // --- ANTI-CHEAT: Prevent Pasting ---
    writeArea.addEventListener("paste", (e) => {
      e.preventDefault();
      
      // Flash the red warning toast if they try to paste
      if (wipeToast) {
        wipeToast.hidden = false;
        announce("Pasting is strictly forbidden. Keep typing.");
        const wipeDetail = $("#wipeToastDetail");
        if (wipeDetail) {
          wipeDetail.textContent = "You must generate your own thoughts in the arena.";
          wipeDetail.hidden = false;
        }
        // Hide the toast after 2.4 seconds
        setTimeout(() => { if (wipeToast) wipeToast.hidden = true; }, 2400);
      }
    });

    // --- ANTI-CHEAT: Prevent Copying and Cutting ---
    writeArea.addEventListener("copy", (e) => e.preventDefault());
    writeArea.addEventListener("cut", (e) => e.preventDefault());
  }

  function registerKeystroke() {
    state.lastKeystroke = Date.now();
    if (hudPauseIndicator) {
      hudPauseIndicator.textContent = "";
      hudPauseIndicator.classList.remove("hud-pause--warn");
    }
    resetPauseTimer();
  }

  let pauseWarnInterval = null;

  function resetPauseTimer() {
    clearTimeout(state.pauseTimerId);
    clearInterval(pauseWarnInterval);

    let elapsed = 0;
    pauseWarnInterval = setInterval(() => {
      elapsed += 250;
      const remainingMs = PAUSE_LIMIT_MS - elapsed;
      if (remainingMs <= 0) { clearInterval(pauseWarnInterval); return; }
      if (remainingMs <= 3000 && hudPauseIndicator) {
        const secsLeft = Math.ceil(remainingMs / 1000);
        hudPauseIndicator.textContent = `no activity - ${secsLeft}s`;
        hudPauseIndicator.classList.add("hud-pause--warn");
      }
    }, 250);

    state.pauseTimerId = setTimeout(triggerErasure, PAUSE_LIMIT_MS);
  }

  function triggerErasure() {
    if (state.completed) return;
    state.pauses += 1;

    const secondsIntoSession = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0;
    const textBefore = state.text.trim();
    state.pauseEvents.push({
      pauseNumber: state.pauses,
      wordCount: state.wordCount,
      secondsIntoSession,
      textBefore: textBefore.length > 160 ? textBefore.slice(-160) : textBefore
    });

    if (staticWipe) staticWipe.classList.add("is-active");
    if (wipeToast) {
      wipeToast.hidden = false;
      announce("Pause detected. Your text has been cleared.");
    }

    const pauseStats = getHistoricalPauseStats(getHistory());
    const wipeDetail = $("#wipeToastDetail");
    if (wipeDetail) {
      if (pauseStats && pauseStats.avgWordCountAtFirstPause != null && state.pauses === 1) {
        const diff = state.wordCount - pauseStats.avgWordCountAtFirstPause;
        if (Math.abs(diff) >= 5) {
          wipeDetail.textContent = diff < 0
            ? `you stopped at ${state.wordCount} words - usually you make it to ${pauseStats.avgWordCountAtFirstPause} before your first pause.`
            : `you stopped at ${state.wordCount} words - past your usual first-pause mark of ${pauseStats.avgWordCountAtFirstPause}. nice.`;
          wipeDetail.hidden = false;
        } else {
          wipeDetail.hidden = true;
        }
      } else {
        wipeDetail.hidden = true;
      }
    }

    setTimeout(() => {
      state.text = "";
      if (writeArea) writeArea.value = "";
      updateWordCount();
      if (staticWipe) staticWipe.classList.remove("is-active");
    }, 220);

    setTimeout(() => {
      if (wipeToast) wipeToast.hidden = true;
    }, 2400);

    if (hudPauseIndicator) {
      hudPauseIndicator.textContent = "";
      hudPauseIndicator.classList.remove("hud-pause--warn");
    }
    resetPauseTimer();
    if (writeArea) writeArea.focus();
  }

  const giveUpBtn = $("#giveUpBtn");
  if (giveUpBtn) giveUpBtn.addEventListener("click", () => finishRound(false, true));

  function stopTimers() {
    clearInterval(state.timerId);
    clearTimeout(state.pauseTimerId);
    clearInterval(pauseWarnInterval);
  }

  function finishRound(success, bailed) {
    stopTimers();
    state.completed = success;
    state.timeSpent = Math.round((Date.now() - state.startedAt) / 1000);
    showScreen("analyzing");
    runAnalysis();
  }

  /* ================================================================
     SCREEN 6 - ANALYSIS
  ================================================================ */

  const ANALYZE_PHRASES = [
    "reading your brain…",
    "scoring the chaos…",
    "mapping your thinking patterns…",
    "summoning your archetype…",
    "analyzing across 5 dimensions…"
  ];

  async function runAnalysis() {
    const analyzingText = $("#analyzingText");
    if (analyzingText) analyzingText.textContent = ANALYZE_PHRASES[Math.floor(Math.random() * ANALYZE_PHRASES.length)];

    const domainName = state.effectiveDomain ? state.effectiveDomain.name : (state.domain.name || "General");
    const savedText = state.text;
    const savedTopic = state.topic;

    try {
      const analysis = await analyzeContentWithGroq(
        savedText, domainName,
        state.isFreeWrite ? null : savedTopic,
        state.isFreeWrite ? null : state.direction,
        state.isFreeWrite
      );
      state.analysis = analysis;

      const hist = getHistory();
      const alreadySaved = hist.some(e => e.text === savedText && e.topic === savedTopic && e.analysis);
      let momentum = null;
      if (!alreadySaved) {
        momentum = computeMomentum(analysis, hist);
        saveToHistory(analysis, momentum);
        if (state.completed) {
          incrementStreak();
        } else {
          resetStreak();
        }
      } else {
        momentum = computeMomentum(analysis, hist);
      }

      renderResults(analysis, momentum);
      showScreen("results");
      updateHistoryBadge();
    } catch (err) {
      console.error(err);
      if (analyzingText) {
        analyzingText.textContent = (err.message || "Analysis failed.") + " ";
        const retryBtn = document.createElement("button");
        retryBtn.textContent = "retry analysis";
        retryBtn.type = "button";
        retryBtn.className = "link-btn";
        retryBtn.style.marginLeft = "6px";
        retryBtn.onclick = () => runAnalysis();
        analyzingText.appendChild(retryBtn);
      }
    }
  }

  /* ================================================================
     SCREEN 7 - RESULTS
  ================================================================ */

  function renderResults(a, momentum) {
    const score = a.overall_score || 0;
    const tier = getTier(score);

    const badgeIcon = $("#badgeIcon");
    const badgeTier = $("#badgeTier");
    const badgeScore = $("#badgeScore");
    const tierDesc = $("#tierDescription");

    if (badgeIcon) badgeIcon.textContent = tier.icon;
    if (badgeTier) {
      badgeTier.textContent = tier.name.toUpperCase();
      badgeTier.style.color = tier.color;
    }
    if (badgeScore) badgeScore.textContent = score;
    if (tierDesc) tierDesc.textContent = tier.description;

    const progress = getProgressToNext(score);
    const progressBar = $("#badgeProgressBar");
    const progressLabel = $("#badgeProgressLabel");
    const nextTier = getNextTier(score);
    const currentIdx = TIERS.indexOf(nextTier);
    const nextName = TIERS[currentIdx + 1]?.name || "MAX";
    if (progressBar) {
      progressBar.style.width = progress + "%";
      progressBar.style.background = `linear-gradient(90deg, ${tier.color}, ${tier.color}88)`;
    }
    if (progressLabel) {
      const ptsToNext = nextTier.max - score;
      progressLabel.textContent = ptsToNext > 0 ? `${Math.round(progress)}% to ${nextName} (+${ptsToNext} pts needed)` : "MAX TIER";
    }

    const hist = getHistory();
    const msgEl = $("#improvementMsg");
    const textEl = $("#improvementText");
    if (hist.length >= 2 && msgEl) {
      const last = hist[hist.length - 2];
      const diff = score - (last.analysis.overall_score || 0);
      if (Math.abs(diff) > 2) {
        msgEl.hidden = false;
        if (textEl) textEl.textContent = diff > 0
          ? `📈 +${diff} points since last time. You're improving.`
          : `📉 ${Math.abs(diff)} points down. Consistency beats perfection.`;
      } else {
        msgEl.hidden = true;
      }
    } else if (msgEl) {
      msgEl.hidden = true;
    }

    if (!state.completed) {
      const incompleteMsg = $("#incompleteMsg");
      if (incompleteMsg) {
        incompleteMsg.hidden = false;
        incompleteMsg.textContent = `⚠️ You didn't hit the word goal - but your thinking still got analyzed. Hit it next time.`;
      }
    } else {
      const incompleteMsg = $("#incompleteMsg");
      if (incompleteMsg) incompleteMsg.hidden = true;
    }

    const archIcon = $("#archIcon");
    const archName = $("#archName");
    const archDesc = $("#archDesc");
    const archStyle = $("#archStyle");
    const archCeiling = $("#archCeiling");

    if (archIcon) archIcon.textContent = a.archetype_icon || "🧠";
    if (archName) archName.textContent = a.archetype_name || "The Thinker";
    if (archDesc) archDesc.textContent = a.archetype_full_description || a.profile_description || "";
    if (archStyle) archStyle.textContent = a.archetype_thinking_style || a.thinking_style || "";
    if (archCeiling) archCeiling.textContent = a.archetype_ceiling ? `🎯 ${a.archetype_ceiling}` : "";

    renderDimensionScoreCards(a, momentum);
    renderMomentumCard(momentum);
    renderPausePatternCard();

    const topStrengthEl = $("#topStrength");
    const criticalGapEl = $("#criticalGap");
    const nextStepEl = $("#nextStep");

    if (topStrengthEl) topStrengthEl.textContent = a.top_strength || a.brief_strengths || "-";
    if (criticalGapEl) criticalGapEl.textContent = a.critical_gap || a.brief_weaknesses || "-";
    if (nextStepEl) nextStepEl.textContent = a.next_step || "-";

    const spellcheckWrap = $("#spellcheckWrap");
    const spellcheckList = $("#spellcheckList");
    if (a.spelling_errors && a.spelling_errors.length > 0 && spellcheckList) {
      spellcheckList.innerHTML = a.spelling_errors.map(e => `<li>${escapeHtml(e)}</li>`).join("");
      if (spellcheckWrap) spellcheckWrap.hidden = false;
    } else if (spellcheckWrap) {
      spellcheckWrap.hidden = true;
    }

    renderRadar(a);
    renderHistoryGraph();

    if (score >= 70 && state.completed) {
      setTimeout(() => launchConfetti(), 400);
    }
  }

  function renderDimensionScoreCards(a, momentum) {
    const container = $("#dimensionCards");
    if (!container) return;

    container.innerHTML = DIMENSIONS.map(dim => {
      const score = a[dim.key] || 0;
      const meaning = a[`${dim.key}_meaning`] || "";
      const quote = a[`${dim.key}_quote`] || "";
      const fix = a[`${dim.key}_fix`] || "";
      const pct = score;
      const tier = score >= 70 ? "strong" : score >= 45 ? "mid" : "weak";
      const tierColor = score >= 70 ? dim.color : score >= 45 ? "#ffb800" : "#ff3b3b";

      let deltaHtml = "";
      if (momentum && momentum.available) {
        const delta = momentum.deltas[dim.key];
        if (Math.abs(delta) >= 1) {
          const isUp = delta > 0;
          deltaHtml = `<span class="dim-delta ${isUp ? 'dim-delta--up' : 'dim-delta--down'}">${isUp ? '▲' : '▼'} ${isUp ? '+' : ''}${delta} vs your avg</span>`;
        } else {
          deltaHtml = `<span class="dim-delta dim-delta--flat">- steady vs your avg</span>`;
        }
      }

      const isTarget = state.targetDimension && state.targetDimension.key === dim.key;

      return `
        <div class="dim-card" data-tier="${tier}">
          <div class="dim-card__header">
            <div class="dim-card__left">
              <span class="dim-card__icon">${dim.icon}</span>
              <div>
                <div class="dim-card__name">${dim.label} ${isTarget ? '<span class="dim-target-tag">🎯 today\'s focus</span>' : ''}</div>
                <div class="dim-card__theory">Based on ${dim.theory}</div>
              </div>
            </div>
            <div class="dim-card__score" style="color:${tierColor}">
              <span class="dim-score-num">${score}</span>
              <span class="dim-score-max">/100</span>
            </div>
          </div>
          <div class="dim-card__bar-wrap">
            <div class="dim-card__bar-fill" style="width:${pct}%;background:${tierColor}"></div>
          </div>
          ${deltaHtml ? `<div class="dim-delta-row">${deltaHtml}</div>` : ""}
          ${meaning ? `<p class="dim-card__meaning">${escapeHtml(meaning)}</p>` : ""}
          ${quote ? `
            <div class="dim-card__quote-block">
              <span class="dim-card__quote-label">from your text</span>
              <blockquote class="dim-card__quote">"${escapeHtml(quote)}"</blockquote>
            </div>
          ` : ""}
          ${fix ? `
            <div class="dim-card__fix-block">
              <span class="dim-card__fix-label">💡 how to improve this</span>
              <p class="dim-card__fix">${escapeHtml(fix)}</p>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  }

  function renderMomentumCard(momentum) {
    const wrap = $("#momentumWrap");
    if (!wrap) return;

    if (!momentum || !momentum.available) {
      wrap.hidden = false;
      wrap.innerHTML = `
        <p class="section-label">${MOMENTUM_DIM.icon} momentum index</p>
        <div class="momentum-card momentum-card--empty">
          <p>Momentum tracks your trajectory across sessions, not just this one score. Play ${3 - (momentum?.baselineCount || 0)} more round${(3 - (momentum?.baselineCount || 0)) === 1 ? '' : 's'} to unlock your baseline.</p>
        </div>
      `;
      return;
    }

    const score = momentum.momentumScore;
    const isPositive = score > 55;
    const isNegative = score < 45;
    const stateLabel = isPositive ? "TRENDING UP" : isNegative ? "TRENDING DOWN" : "HOLDING STEADY";
    const stateColor = isPositive ? "#34d399" : isNegative ? "#ff3b3b" : "#ffb800";

    const sortedDeltas = DIMENSIONS
      .map(d => ({ ...d, delta: momentum.deltas[d.key] }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const biggestMove = sortedDeltas[0];

    wrap.hidden = false;
    wrap.innerHTML = `
      <p class="section-label">${MOMENTUM_DIM.icon} momentum index</p>
      <div class="momentum-card">
        <div class="momentum-card__top">
          <div class="momentum-card__score" style="color:${stateColor}">
            ${score}<span class="momentum-card__max">/100</span>
          </div>
          <div class="momentum-card__state" style="color:${stateColor}">${stateLabel}</div>
        </div>
        <p class="momentum-card__desc">Compares this round's 5 dimensions against your rolling 3-session average. This is the score that matters if you're trying to actually improve, not just hit a number once.</p>
        ${biggestMove && Math.abs(biggestMove.delta) >= 1 ? `
          <div class="momentum-card__highlight">
            <span class="momentum-card__highlight-icon">${biggestMove.icon}</span>
            <span>Your biggest move: <strong>${biggestMove.label}</strong> ${biggestMove.delta > 0 ? 'jumped' : 'dropped'} <strong>${Math.abs(biggestMove.delta)} pts</strong> vs your average.</span>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderPausePatternCard() {
    const wrap = $("#pausePatternWrap");
    if (!wrap) return;

    const hist = getHistory();
    const stats = getHistoricalPauseStats(hist.slice(0, -1));
    const thisSessionPauses = state.pauseEvents || [];

    if (thisSessionPauses.length === 0) {
      wrap.hidden = true;
      return;
    }

    wrap.hidden = false;

    let comparisonHtml = "";
    if (stats && stats.avgPausesPerSession != null) {
      const diff = Math.round((thisSessionPauses.length - stats.avgPausesPerSession) * 10) / 10;
      if (Math.abs(diff) >= 0.5) {
        comparisonHtml = `<p class="pause-pattern__compare">You had <strong>${thisSessionPauses.length} pause${thisSessionPauses.length === 1 ? '' : 's'}</strong> this session vs. your average of <strong>${stats.avgPausesPerSession}</strong>.</p>`;
      } else {
        comparisonHtml = `<p class="pause-pattern__compare">You had <strong>${thisSessionPauses.length} pause${thisSessionPauses.length === 1 ? '' : 's'}</strong> this session - right in line with your usual pace.</p>`;
      }
    } else {
      comparisonHtml = `<p class="pause-pattern__compare">You had <strong>${thisSessionPauses.length} pause${thisSessionPauses.length === 1 ? '' : 's'}</strong> this session. Keep playing to build your baseline.</p>`;
    }

    const eventsHtml = thisSessionPauses.map((ev, i) => {
      const snippet = ev.textBefore ? `…${escapeHtml(ev.textBefore.slice(-70))}` : "(nothing written yet)";
      return `
        <div class="pause-event">
          <span class="pause-event__num">#${ev.pauseNumber}</span>
          <div class="pause-event__body">
            <span class="pause-event__meta">stopped at <strong>${ev.wordCount} words</strong> · ${ev.secondsIntoSession}s into the round</span>
            <span class="pause-event__snippet">${snippet}</span>
          </div>
        </div>
      `;
    }).join("");

    wrap.innerHTML = `
      <p class="section-label">⏸ pause pattern</p>
      <div class="pause-pattern-card">
        ${comparisonHtml}
        <div class="pause-events-list">${eventsHtml}</div>
        <p class="pause-pattern__tip">💡 Pauses usually happen right after you commit to a claim and aren't sure how to back it up. Notice what came right before each stop above - that's where your thinking actually broke down, not where the words ran out.</p>
      </div>
    `;
  }

  function renderRadar(a) {
    const dims = [
      { key: "structural_clarity", label: "Structure" },
      { key: "cognitive_depth", label: "Depth" },
      { key: "original_synthesis", label: "Synthesis" },
      { key: "rhetorical_power", label: "Rhetoric" },
      { key: "metacognitive_awareness", label: "Meta" }
    ];

    const cx = 160, cy = 160, maxR = 120;
    const n = dims.length;
    const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;

    function pointAt(i, r) {
      const a = angle(i);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }

    let svg = "";
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      const pts = dims.map((_, i) => pointAt(i, maxR * f).join(",")).join(" ");
      svg += `<polygon points="${pts}" class="radar-grid" />`;
    });

    dims.forEach((d, i) => {
      const [x, y] = pointAt(i, maxR);
      svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-spoke" />`;
      const [lx, ly] = pointAt(i, maxR + 28);
      svg += `<text x="${lx}" y="${ly}" class="radar-label" text-anchor="middle" dominant-baseline="middle">${d.label}</text>`;
    });

    const dataPts = dims.map((d, i) => pointAt(i, maxR * ((a[d.key] || 0) / 100)).join(",")).join(" ");
    svg += `<polygon points="${dataPts}" class="radar-data" />`;
    dims.forEach((d, i) => {
      const [x, y] = pointAt(i, maxR * ((a[d.key] || 0) / 100));
      const score = a[d.key] || 0;
      const tierClass = score >= 70 ? "radar-dot--strong" : score >= 45 ? "radar-dot--mid" : "radar-dot--weak";
      svg += `<circle cx="${x}" cy="${y}" r="5" class="radar-dot ${tierClass}" />`;
    });

    const chart = $("#radarChart");
    if (chart) chart.innerHTML = svg;

    const legend = $("#radarLegend");
    if (legend) {
      legend.innerHTML = dims.map((d) => {
        const score = a[d.key] || 0;
        const tierClass = score >= 70 ? "legend--strong" : score >= 45 ? "legend--mid" : "legend--weak";
        return `<div class="radar-legend__item"><span class="legend-dot ${tierClass}"></span>${d.label}<span class="legend-score">${score}</span></div>`;
      }).join("");
    }
  }

  function launchConfetti() {
    const colors = ["#c8ff00", "#9f7aea", "#ff9f40", "#38bdf8", "#f472b6"];
    const container = document.body;

    for (let i = 0; i < 40; i++) {
      const dot = document.createElement("div");
      dot.className = "confetti-dot";
      dot.style.cssText = `
        position: fixed;
        top: ${Math.random() * 40}%;
        left: ${Math.random() * 100}%;
        width: ${4 + Math.random() * 6}px;
        height: ${4 + Math.random() * 6}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: ${Math.random() > 0.5 ? "50%" : "2px"};
        z-index: 9998;
        pointer-events: none;
        animation: confettiFall ${1.2 + Math.random() * 1.5}s ease-in forwards;
        animation-delay: ${Math.random() * 0.5}s;
      `;
      container.appendChild(dot);
      setTimeout(() => dot.remove(), 2500);
    }
  }

  function saveToHistory(a, momentum) {
    let hist = getHistory();
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      domain: state.effectiveDomain ? state.effectiveDomain.name : (state.domain.name || "General"),
      domainId: state.effectiveDomain ? state.effectiveDomain.id : (state.domain.id || "general"),
      difficulty: state.difficulty,
      duration: state.duration,
      wordGoal: state.wordGoal,
      isFreeWrite: state.isFreeWrite,
      topic: state.isFreeWrite ? null : state.topic,
      direction: state.isFreeWrite ? null : state.direction,
      text: state.text,
      wordCount: state.wordCount,
      pauses: state.pauses,
      pauseEvents: state.pauseEvents,
      timeSpent: state.timeSpent,
      completed: state.completed,
      analysis: a,
      momentum: momentum || null,
      targetDimension: state.targetDimension ? state.targetDimension.key : null
    };
    hist.push(entry);
    if (hist.length > 50) hist = hist.slice(-50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    state.history = hist;
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch (_) { return []; }
  }

  function updateHistoryBadge() {
    const hist = getHistory();
    const badge = $("#historyBadge");
    if (badge) badge.textContent = hist.length;
  }

  function renderHistoryGraph() {
    const hist = getHistory();
    const wrap = $("#historyWrap");
    if (hist.length < 2) {
      if (wrap) wrap.hidden = true;
      return;
    }
    if (wrap) wrap.hidden = false;

    const w = 400, h = 120, pad = 16;
    const maxScore = 100;
    const stepX = (w - pad * 2) / (hist.length - 1);

    const points = hist.map((entry, i) => {
      const x = pad + stepX * i;
      const y = h - pad - (entry.analysis.overall_score / maxScore) * (h - pad * 2);
      return [x, y];
    });

    let svg = `<polyline points="${points.map(p => p.join(",")).join(" ")}" class="history-line" />`;
    points.forEach(([x, y], i) => {
      svg += `<circle cx="${x}" cy="${y}" r="4" class="history-dot" />`;
      svg += `<text x="${x}" y="${h - 2}" class="history-x" text-anchor="middle">${hist[i].analysis.overall_score}</text>`;
    });

    const chart = $("#historyChart");
    if (chart) chart.innerHTML = svg;

    const first = hist[0].analysis.overall_score;
    const last = hist[hist.length - 1].analysis.overall_score;
    const delta = last - first;
    const note = $("#historyNote");
    if (note) {
      if (Math.abs(delta) >= 3) {
        note.textContent = delta > 0
          ? `↑ Overall score improved by +${delta} points over ${hist.length} sessions.`
          : `↓ Score dipped ${Math.abs(delta)} points across ${hist.length} sessions. Keep grinding.`;
      } else {
        note.textContent = `${hist.length} sessions tracked on this device.`;
      }
    }
  }

  const playAgainBtn = $("#playAgainBtn");
  if (playAgainBtn) {
    playAgainBtn.addEventListener("click", () => {
      showScreen("topic");
      runTopicGeneration();
    });
  }

  const newLaneBtn = $("#newLaneBtn");
  if (newLaneBtn) {
    newLaneBtn.addEventListener("click", () => {
      resetSelections();
      showScreen("domain");
    });
  }

  function resetSelections() {
    state.domain = null;
    state.difficulty = null;
    state.duration = null;
    state.wordGoal = null;
    state.direction = null;
    state.topic = null;
    state.topicOptions = null;
    state.effectiveDomain = null;
    state.isFreeWrite = false;

    $$(".domain-card").forEach(c => { c.classList.remove("is-selected"); c.setAttribute("aria-selected", "false"); });
    $$(".diff-card").forEach(c => { c.classList.remove("is-selected"); c.setAttribute("aria-selected", "false"); });
    if (startGameBtn) startGameBtn.disabled = true;
    if (toTopicBtn) toTopicBtn.disabled = true;

    const retryBtn = $("#retryTopicBtn");
    if (retryBtn) retryBtn.textContent = "retry";
    const fallbackBtn = $("#useFallbackBtn");
    if (fallbackBtn) fallbackBtn.remove();
  }

  /* ================================================================
     SCREEN 8 - HISTORY LOG
  ================================================================ */

  function renderHistoryScreen() {
    const hist = getHistory();
    const list = $("#historyList");
    const count = $("#historyCount");

    if (count) count.textContent = `${hist.length} attempt${hist.length === 1 ? "" : "s"}`;

    if (hist.length === 0) {
      if (list) {
        list.innerHTML = `
          <div class="history-empty">
            <span class="big-icon">📭</span>
            <p>No attempts yet. Go spit something!</p>
          </div>`;
      }
      return;
    }

    let html = "";
    const sorted = [...hist].reverse();
    sorted.forEach((entry) => {
      const score = entry.analysis.overall_score;
      const tier = getTier(score);
      const isFree = entry.isFreeWrite;
      const topicDisplay = isFree ? `✏️ Free Write - ${entry.domain}` : (entry.topic || "Untitled");
      const date = new Date(entry.timestamp);
      const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const completed = entry.completed !== undefined ? entry.completed : true;

      const dims = [
        { k: "structural_clarity", fallback: "clarity", label: "Structure" },
        { k: "cognitive_depth", fallback: "depth", label: "Depth" },
        { k: "original_synthesis", fallback: "originality", label: "Synthesis" },
        { k: "rhetorical_power", fallback: "engagement", label: "Rhetoric" },
        { k: "metacognitive_awareness", fallback: "coherence", label: "Meta" }
      ];

      html += `
        <div class="history-item" data-id="${entry.id}">
          <div class="history-item__top">
            <div style="flex:1;min-width:0;">
              <div class="history-item__meta">
                <span>${dateStr}</span>
                <span>${entry.domain}</span>
                <span>${entry.difficulty}</span>
                <span>${entry.wordCount} words</span>
                <span>${entry.pauses} pauses</span>
                ${!completed ? '<span style="color:#f97316;font-weight:600;">⚠️ incomplete</span>' : ''}
              </div>
              <div class="history-item__topic">
                ${escapeHtml(topicDisplay)}
                ${isFree ? '<span class="free-badge">free</span>' : ''}
              </div>
              <div class="history-item__excerpt">${escapeHtml(entry.text.slice(0, 120))}${entry.text.length > 120 ? '…' : ''}</div>
            </div>
            <div class="history-item__score" style="color:${tier.color}">
              ${score}<span class="max">/100</span>
              <div style="font-size:0.65rem;font-family:var(--font-mono);color:var(--text-muted);margin-top:0.25rem;">${tier.icon} ${tier.name}</div>
            </div>
          </div>
          <div class="history-item__expand" id="expand-${entry.id}">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
              <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">full text</span>
              <span style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);">${entry.wordCount} words · ${entry.timeSpent}s</span>
            </div>
            <div class="history-item__full-text">${escapeHtml(entry.text)}</div>
            <div style="margin-top:0.75rem;">
              <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">scores</span>
              <div class="history-item__analysis-grid">
                ${dims.map(d => {
                  const v = entry.analysis[d.k] || entry.analysis[d.fallback] || 0;
                  const cls = v >= 70 ? "good" : v >= 45 ? "mid" : "bad";
                  return `<div class="mini-stat">${d.label} <span class="val ${cls}">${v}</span></div>`;
                }).join("")}
                <div class="mini-stat" style="grid-column:1/-1;border-color:var(--accent-dim);">
                  Archetype <span style="color:var(--accent);font-weight:700;">${entry.analysis.archetype_icon || ''} ${entry.analysis.archetype_name || '-'}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="history-item__actions">
            <button type="button" class="link-btn" style="font-size:0.7rem;" data-toggle="${entry.id}">
              ▼ show details
            </button>
            <button type="button" class="history-report-btn" data-report-id="${entry.id}">
              📊 full report
            </button>
          </div>
        </div>`;
    });

    if (list) list.innerHTML = html;

    list.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.toggle;
        const expand = document.getElementById(`expand-${id}`);
        if (!expand) return;
        const isOpen = expand.classList.toggle("is-open");
        btn.textContent = isOpen ? "▲ hide details" : "▼ show details";
      });
    });

    list.querySelectorAll('[data-report-id]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.reportId);
        const hist = getHistory();
        const entry = hist.find(e => e.id === id);
        if (entry) openHistoryDetail(entry);
      });
    });
  }

  const clearHistoryBtn = $("#clearHistoryBtn");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      if (confirm("Delete all history? This can't be undone.")) {
        localStorage.removeItem(HISTORY_KEY);
        renderHistoryScreen();
        updateHistoryBadge();
      }
    });
  }

  /* ================================================================
     HISTORY DETAIL - Full Report Replay
  ================================================================ */

  function renderDetailRadar(a, svgId, legendId) {
    const dims = [
      { key: "structural_clarity", label: "Structure" },
      { key: "cognitive_depth", label: "Depth" },
      { key: "original_synthesis", label: "Synthesis" },
      { key: "rhetorical_power", label: "Rhetoric" },
      { key: "metacognitive_awareness", label: "Meta" }
    ];
    const cx = 160, cy = 160, maxR = 120;
    const n = dims.length;
    const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
    function pointAt(i, r) {
      const a = angle(i);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }
    let svg = "";
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      const pts = dims.map((_, i) => pointAt(i, maxR * f).join(",")).join(" ");
      svg += `<polygon points="${pts}" class="radar-grid" />`;
    });
    dims.forEach((d, i) => {
      const [x, y] = pointAt(i, maxR);
      svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-spoke" />`;
      const [lx, ly] = pointAt(i, maxR + 28);
      svg += `<text x="${lx}" y="${ly}" class="radar-label" text-anchor="middle" dominant-baseline="middle">${d.label}</text>`;
    });
    const dataPts = dims.map((d, i) => pointAt(i, maxR * ((a[d.key] || 0) / 100)).join(",")).join(" ");
    svg += `<polygon points="${dataPts}" class="radar-data" />`;
    dims.forEach((d, i) => {
      const [x, y] = pointAt(i, maxR * ((a[d.key] || 0) / 100));
      const score = a[d.key] || 0;
      const tierClass = score >= 70 ? "radar-dot--strong" : score >= 45 ? "radar-dot--mid" : "radar-dot--weak";
      svg += `<circle cx="${x}" cy="${y}" r="5" class="radar-dot ${tierClass}" />`;
    });
    const chart = $(`#${svgId}`);
    if (chart) chart.innerHTML = svg;
    const legend = $(`#${legendId}`);
    if (legend) {
      legend.innerHTML = dims.map((d) => {
        const score = a[d.key] || 0;
        const tierClass = score >= 70 ? "legend--strong" : score >= 45 ? "legend--mid" : "legend--weak";
        return `<div class="radar-legend__item"><span class="legend-dot ${tierClass}"></span>${d.label}<span class="legend-score">${score}</span></div>`;
      }).join("");
    }
  }

  function renderDetailDimCards(a, containerId, momentum) {
    const container = $(`#${containerId}`);
    if (!container) return;
    container.innerHTML = DIMENSIONS.map(dim => {
      const score = a[dim.key] || 0;
      const meaning = a[`${dim.key}_meaning`] || "";
      const quote = a[`${dim.key}_quote`] || "";
      const fix = a[`${dim.key}_fix`] || "";
      const pct = score;
      const tierColor = score >= 70 ? dim.color : score >= 45 ? "#ffb800" : "#ff3b3b";

      let deltaHtml = "";
      if (momentum && momentum.available) {
        const delta = momentum.deltas[dim.key];
        if (Math.abs(delta) >= 1) {
          const isUp = delta > 0;
          deltaHtml = `<div class="dim-delta-row"><span class="dim-delta ${isUp ? 'dim-delta--up' : 'dim-delta--down'}">${isUp ? '▲' : '▼'} ${isUp ? '+' : ''}${delta} vs avg at the time</span></div>`;
        }
      }

      return `
        <div class="dim-card">
          <div class="dim-card__header">
            <div class="dim-card__left">
              <span class="dim-card__icon">${dim.icon}</span>
              <div>
                <div class="dim-card__name">${dim.label}</div>
                <div class="dim-card__theory">Based on ${dim.theory}</div>
              </div>
            </div>
            <div class="dim-card__score" style="color:${tierColor}">
              <span class="dim-score-num">${score}</span>
              <span class="dim-score-max">/100</span>
            </div>
          </div>
          <div class="dim-card__bar-wrap">
            <div class="dim-card__bar-fill" style="width:${pct}%;background:${tierColor}"></div>
          </div>
          ${deltaHtml}
          ${meaning ? `<p class="dim-card__meaning">${escapeHtml(meaning)}</p>` : ""}
          ${quote ? `<div class="dim-card__quote-block"><span class="dim-card__quote-label">from your text</span><blockquote class="dim-card__quote">"${escapeHtml(quote)}"</blockquote></div>` : ""}
          ${fix ? `<div class="dim-card__fix-block"><span class="dim-card__fix-label">💡 how to improve this</span><p class="dim-card__fix">${escapeHtml(fix)}</p></div>` : ""}
        </div>
      `;
    }).join("");
  }

  function renderDetailMomentum(entry) {
    const wrap = $("#detailMomentumWrap");
    if (!wrap) return;
    const momentum = entry.momentum;
    if (!momentum || !momentum.available) {
      wrap.hidden = true;
      return;
    }
    const score = momentum.momentumScore;
    const isPositive = score > 55;
    const isNegative = score < 45;
    const stateLabel = isPositive ? "TRENDING UP" : isNegative ? "TRENDING DOWN" : "HOLDING STEADY";
    const stateColor = isPositive ? "#34d399" : isNegative ? "#ff3b3b" : "#ffb800";
    wrap.hidden = false;
    wrap.innerHTML = `
      <p class="section-label">📈 momentum index (at the time)</p>
      <div class="momentum-card">
        <div class="momentum-card__top">
          <div class="momentum-card__score" style="color:${stateColor}">${score}<span class="momentum-card__max">/100</span></div>
          <div class="momentum-card__state" style="color:${stateColor}">${stateLabel}</div>
        </div>
        <p class="momentum-card__desc">How this round compared to the rolling 3-session average at the time it was played.</p>
      </div>
    `;
  }

  function renderDetailPausePattern(entry) {
    const wrap = $("#detailPausePatternWrap");
    if (!wrap) return;
    const events = entry.pauseEvents || [];
    if (events.length === 0) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const eventsHtml = events.map(ev => {
      const snippet = ev.textBefore ? `…${escapeHtml(ev.textBefore.slice(-70))}` : "(nothing written yet)";
      return `
        <div class="pause-event">
          <span class="pause-event__num">#${ev.pauseNumber}</span>
          <div class="pause-event__body">
            <span class="pause-event__meta">stopped at <strong>${ev.wordCount} words</strong> · ${ev.secondsIntoSession}s in</span>
            <span class="pause-event__snippet">${snippet}</span>
          </div>
        </div>
      `;
    }).join("");
    wrap.innerHTML = `
      <p class="section-label">⏸ pause pattern</p>
      <div class="pause-pattern-card">
        <p class="pause-pattern__compare">${events.length} pause${events.length === 1 ? '' : 's'} this session.</p>
        <div class="pause-events-list">${eventsHtml}</div>
      </div>
    `;
  }

  function openHistoryDetail(entry) {
    const a = entry.analysis;
    const score = a.overall_score || 0;
    const tier = getTier(score);

    const metaEl = $("#historyDetailMeta");
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString() + " · " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const isFree = entry.isFreeWrite;
    const topicDisplay = isFree ? `✏️ Free Write - ${entry.domain}` : (entry.topic || "Untitled");
    if (metaEl) metaEl.textContent = `${dateStr} · ${entry.domain} · ${entry.difficulty} · ${entry.wordCount} words`;

    const el = (id) => $(id);
    if (el("#detailBadgeIcon")) el("#detailBadgeIcon").textContent = tier.icon;
    if (el("#detailBadgeScore")) el("#detailBadgeScore").textContent = score;
    if (el("#detailBadgeTier")) { el("#detailBadgeTier").textContent = tier.name.toUpperCase(); el("#detailBadgeTier").style.color = tier.color; }
    if (el("#detailTierDescription")) el("#detailTierDescription").textContent = tier.description;
    const progress = getProgressToNext(score);
    if (el("#detailProgressBar")) { el("#detailProgressBar").style.width = progress + "%"; el("#detailProgressBar").style.background = `linear-gradient(90deg, ${tier.color}, ${tier.color}88)`; }

    if (el("#detailArchIcon")) el("#detailArchIcon").textContent = a.archetype_icon || "🧠";
    if (el("#detailArchName")) el("#detailArchName").textContent = a.archetype_name || "-";
    if (el("#detailArchDesc")) el("#detailArchDesc").textContent = a.archetype_full_description || "";
    if (el("#detailArchStyle")) el("#detailArchStyle").textContent = a.archetype_thinking_style || "";
    if (el("#detailArchCeiling")) el("#detailArchCeiling").textContent = a.archetype_ceiling ? `🎯 ${a.archetype_ceiling}` : "";

    if (el("#detailTopStrength")) el("#detailTopStrength").textContent = a.top_strength || "-";
    if (el("#detailCriticalGap")) el("#detailCriticalGap").textContent = a.critical_gap || "-";
    if (el("#detailNextStep")) el("#detailNextStep").textContent = a.next_step || "-";

    renderDetailDimCards(a, "detailDimensionCards", entry.momentum);
    renderDetailRadar(a, "detailRadarChart", "detailRadarLegend");
    renderDetailMomentum(entry);
    renderDetailPausePattern(entry);

    const textBlock = $("#historyDetailText");
    if (textBlock) textBlock.textContent = entry.text;

    showScreen("history-detail");
  }

  /* ================================================================
     SCREEN 10 - COLLECTION / STATS
  ================================================================ */

  function renderCollectionScreen() {
    const hist = getHistory();
    const BADGE_TIERS = [
      { name: "Raw Signal", icon: "📡", max: 20, color: "#888" },
      { name: "Finding Voice", icon: "🌱", max: 40, color: "#aad900" },
      { name: "Sharp Mind", icon: "⚡", max: 60, color: "#c8ff00" },
      { name: "The Articulate", icon: "🔮", max: 80, color: "#9f7aea" },
      { name: "Neural Fire", icon: "🧠", max: 100, color: "#ff9f40" }
    ];

    const totalGames = hist.length;
    const completed = hist.filter(e => e.completed).length;
    const diffCounts = { easy: 0, medium: 0, hard: 0 };
    hist.forEach(e => { if (e.difficulty && diffCounts[e.difficulty] !== undefined) diffCounts[e.difficulty]++; });
    const avgScore = totalGames > 0 ? Math.round(hist.reduce((s, e) => s + (e.analysis?.overall_score || 0), 0) / totalGames) : 0;
    const bestScore = totalGames > 0 ? Math.max(...hist.map(e => e.analysis?.overall_score || 0)) : 0;
    const totalWords = hist.reduce((s, e) => s + (e.wordCount || 0), 0);
    const streak = state.streak;

    const statsGrid = $("#collectionStatsGrid");
    if (statsGrid) {
      statsGrid.innerHTML = `
        <div class="cstat"><span class="cstat__num">${totalGames}</span><span class="cstat__label">total rounds</span></div>
        <div class="cstat"><span class="cstat__num">${completed}</span><span class="cstat__label">completed</span></div>
        <div class="cstat"><span class="cstat__num">${avgScore}</span><span class="cstat__label">avg score</span></div>
        <div class="cstat"><span class="cstat__num">${bestScore}</span><span class="cstat__label">best score</span></div>
        <div class="cstat"><span class="cstat__num">${totalWords.toLocaleString()}</span><span class="cstat__label">total words</span></div>
        <div class="cstat"><span class="cstat__num">🔥 ${streak}</span><span class="cstat__label">current streak</span></div>
        <div class="cstat"><span class="cstat__num">🌱 ${diffCounts.easy}</span><span class="cstat__label">mild rounds</span></div>
        <div class="cstat"><span class="cstat__num">🔥 ${diffCounts.medium}</span><span class="cstat__label">medium rounds</span></div>
        <div class="cstat"><span class="cstat__num">☠️ ${diffCounts.hard}</span><span class="cstat__label">unhinged rounds</span></div>
      `;
    }

    const badgeCounts = {};
    BADGE_TIERS.forEach(t => { badgeCounts[t.name] = 0; });
    hist.forEach(e => {
      const score = e.analysis?.overall_score || 0;
      const tier = BADGE_TIERS.find(t => score <= t.max) || BADGE_TIERS[BADGE_TIERS.length - 1];
      badgeCounts[tier.name] = (badgeCounts[tier.name] || 0) + 1;
    });

    const badgesEl = $("#collectionBadges");
    const badgeSubEl = $("#collectionBadgeSub");
    const uniqueBadges = Object.values(badgeCounts).filter(c => c > 0).length;
    if (badgeSubEl) badgeSubEl.textContent = `${uniqueBadges} of 5 badge types unlocked`;

    if (badgesEl) {
      badgesEl.innerHTML = BADGE_TIERS.map(t => {
        const count = badgeCounts[t.name] || 0;
        const unlocked = count > 0;
        return `
          <div class="coll-badge ${unlocked ? 'coll-badge--unlocked' : 'coll-badge--locked'}" style="${unlocked ? `--badge-color:${t.color}` : ''}">
            <span class="coll-badge__icon">${unlocked ? t.icon : '🔒'}</span>
            <span class="coll-badge__name">${t.name}</span>
            <span class="coll-badge__count">${count > 0 ? `×${count}` : 'locked'}</span>
          </div>
        `;
      }).join("");
    }

    const archetypeCounts = {};
    hist.forEach(e => {
      const name = e.analysis?.archetype_name;
      const icon = e.analysis?.archetype_icon || "";
      if (name) {
        if (!archetypeCounts[name]) archetypeCounts[name] = { count: 0, icon };
        archetypeCounts[name].count++;
      }
    });
    const archEl = $("#collectionArchetypes");
    if (archEl) {
      const sorted = Object.entries(archetypeCounts).sort((a, b) => b[1].count - a[1].count);
      if (sorted.length === 0) {
        archEl.innerHTML = `<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:0.8rem;">No archetype data yet. Play a round!</p>`;
      } else {
        const max = sorted[0][1].count;
        archEl.innerHTML = sorted.map(([name, data]) => `
          <div class="coll-arch">
            <span class="coll-arch__icon">${data.icon}</span>
            <div class="coll-arch__info">
              <span class="coll-arch__name">${name}</span>
              <div class="coll-arch__bar-wrap">
                <div class="coll-arch__bar" style="width:${(data.count / max * 100).toFixed(0)}%"></div>
              </div>
            </div>
            <span class="coll-arch__count">${data.count}×</span>
          </div>
        `).join("");
      }
    }

    const domainCounts = {};
    hist.forEach(e => {
      const d = e.domain || "Unknown";
      domainCounts[d] = (domainCounts[d] || 0) + 1;
    });
    const domainEl = $("#collectionDomains");
    if (domainEl) {
      const sorted = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 0) {
        domainEl.innerHTML = `<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:0.8rem;">No domain data yet.</p>`;
      } else {
        const max = sorted[0][1];
        domainEl.innerHTML = sorted.map(([name, count]) => `
          <div class="coll-domain">
            <span class="coll-domain__name">${name}</span>
            <div class="coll-domain__bar-wrap">
              <div class="coll-domain__bar" style="width:${(count / max * 100).toFixed(0)}%"></div>
            </div>
            <span class="coll-domain__count">${count}</span>
          </div>
        `).join("");
      }
    }

    const bestsSection = $("#collectionBestsSection");
    const bestsEl = $("#collectionBests");
    if (hist.length === 0) {
      if (bestsSection) bestsSection.style.display = "none";
    } else {
      if (bestsSection) bestsSection.style.display = "";
      const bestEntry = hist.reduce((best, e) => (e.analysis?.overall_score || 0) > (best.analysis?.overall_score || 0) ? e : best, hist[0]);
      const bestWpm = hist.reduce((best, e) => {
        const mins = (e.timeSpent || 1) / 60;
        const wpm = Math.round((e.wordCount || 0) / mins);
        return wpm > best ? wpm : best;
      }, 0);
      const bestWords = hist.reduce((best, e) => (e.wordCount || 0) > best ? (e.wordCount || 0) : best, 0);
      if (bestsEl) {
        bestsEl.innerHTML = `
          <div class="cstat cstat--wide"><span class="cstat__num">${bestEntry.analysis?.overall_score || 0}</span><span class="cstat__label">🏆 highest score · ${getTier(bestEntry.analysis?.overall_score || 0).name}</span></div>
          <div class="cstat cstat--wide"><span class="cstat__num">${bestWpm}</span><span class="cstat__label">⚡ fastest WPM</span></div>
          <div class="cstat cstat--wide"><span class="cstat__num">${bestWords}</span><span class="cstat__label">📝 most words in one session</span></div>
        `;
      }
    }
  }

  /* ================================================================
     INIT & API STUBS
  ================================================================ */

  // Bind all Navbar Links to handle routing and rendering
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault(); // Stop page jump/refresh
      const targetScreen = link.dataset.screen;
      
      // Update dynamic screens before navigating to them
      if (targetScreen === "history") {
        renderHistoryScreen();
      } else if (targetScreen === "collection") {
        renderCollectionScreen();
      }
      
      // Switch the active screen
      if (targetScreen) {
        showScreen(targetScreen);
      }
    });
  });

  loadStreak();
  updateHistoryBadge();
  showScreen("domain");

  window.generateTopic = window.generateTopic || async function(domain, difficulty, duration, wordGoal, target) {
    return {
      type: "single",
      topic: "The future of work in a post-pandemic world",
      direction: "Discuss how remote work has changed our relationship with productivity and burnout."
    };
  };

  window.analyzeContentWithGroq = window.analyzeContentWithGroq || async function(text, domain, topic, direction, isFreeWrite) {
    return {
      overall_score: 72,
      structural_clarity: 68,
      cognitive_depth: 75,
      original_synthesis: 70,
      rhetorical_power: 65,
      metacognitive_awareness: 80,
      archetype_name: "The Reflective Analyst",
      archetype_icon: "🔍",
      archetype_full_description: "You examine ideas from multiple angles before committing to a stance.",
      archetype_thinking_style: "Analytical, cautious, evidence-driven",
      archetype_ceiling: "Your ability to synthesize opposing views is your superpower.",
      top_strength: "Metacognitive awareness - you know what you know and what you don't.",
      critical_gap: "Rhetorical power - your arguments could be more compelling with stronger transitions.",
      next_step: "Focus on building a clear narrative arc in your next piece.",
      spelling_errors: ["recieve", "seperate"],
      structural_clarity_meaning: "Your ideas flow logically but sometimes jump between points.",
      structural_clarity_quote: "The transition from X to Y could be smoother.",
      structural_clarity_fix: "Use topic sentences to guide the reader.",
      cognitive_depth_meaning: "You explore concepts with depth, often connecting to broader themes.",
      cognitive_depth_quote: "Your analysis of Z reveals a deep understanding of its implications.",
      cognitive_depth_fix: "Try to bring in one counterexample to test your reasoning.",
      original_synthesis_meaning: "You combine ideas in novel ways, though sometimes they feel disconnected.",
      original_synthesis_quote: "The link between A and B is an interesting insight.",
      original_synthesis_fix: "Spend more time explaining why these connections matter.",
      rhetorical_power_meaning: "Your writing could be more persuasive with stronger emotional appeals.",
      rhetorical_power_quote: "The conclusion feels rushed; consider a call to action.",
      rhetorical_power_fix: "Use anecdotes to illustrate your points.",
      metacognitive_awareness_meaning: "You're aware of your own thinking process and biases.",
      metacognitive_awareness_quote: "You acknowledge the limits of your perspective.",
      metacognitive_awareness_fix: "Challenge your assumptions more explicitly."
    };
  };

})();