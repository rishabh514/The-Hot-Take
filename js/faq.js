/* ============================================================
   THE HOT TAKE — FAQ screen loader
   Fetches /data/faq-data.json and renders the FAQ screen
   dynamically. Also injects JSON-LD FAQ schema for AEO.
   No external dependencies. Touches nothing in app.js.
   ============================================================ */

(function () {
  "use strict";

  const FAQ_DATA_URL = "/data/faq-data.json";

  /* ── Minimal HTML escape ── */
  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ── Build the full FAQ screen HTML from JSON ── */
  function buildFaqHTML(data) {
    const meta = data.meta || {};

    /* Section accordion HTML */
    const sectionsHTML = (data.sections || []).map((section) => {
      const itemsHTML = (section.items || []).map((item, idx) => {
        const itemId = `faq-${section.id}-${idx}`;
        return `
          <div class="faq-item" id="${itemId}">
            <button
              class="faq-question"
              aria-expanded="false"
              aria-controls="${itemId}-answer"
              type="button"
            >
              <span class="faq-question__text">${esc(item.q)}</span>
              <span class="faq-question__chevron" aria-hidden="true">▾</span>
            </button>
            <div
              class="faq-answer"
              id="${itemId}-answer"
              role="region"
              aria-hidden="true"
            >
              <p>${esc(item.a)}</p>
            </div>
          </div>`;
      }).join("");

      return `
        <div class="faq-section">
          <h2 class="faq-section__heading">${esc(section.heading)}</h2>
          <div class="faq-section__items">${itemsHTML}</div>
        </div>`;
    }).join("");

    return `
      <div class="screen__inner about-inner faq-inner">

        <div class="about-hero">
          <p class="eyebrow">${esc(meta.eyebrow || "faq")}</p>
          <h1 class="display-lg">${esc(meta.title || "FAQ")}<br><span class="text-grad">answered.</span></h1>
          <p class="about-tagline">${esc(meta.subtitle || "")}</p>
        </div>

        <div class="faq-body">
          ${sectionsHTML}
        </div>

        <div class="screen-nav screen-nav--left" style="margin-top:2.5rem;">
          <button type="button" class="ghost-btn" data-back="domain">← back to app</button>
          <button type="button" class="cta-btn" data-back="domain">
            <span>start writing</span><span class="cta-btn__arrow">→</span>
          </button>
        </div>

      </div>`;
  }

  /* ── Accordion interaction ── */
  function attachAccordion(container) {
    container.querySelectorAll(".faq-question").forEach((btn) => {
      btn.addEventListener("click", () => {
        const isOpen = btn.getAttribute("aria-expanded") === "true";
        const answerId = btn.getAttribute("aria-controls");
        const answer = document.getElementById(answerId);

        /* Collapse all others in the same section */
        const section = btn.closest(".faq-section");
        section.querySelectorAll(".faq-question").forEach((other) => {
          if (other !== btn) {
            other.setAttribute("aria-expanded", "false");
            const otherId = other.getAttribute("aria-controls");
            const otherAnswer = document.getElementById(otherId);
            if (otherAnswer) {
              otherAnswer.setAttribute("aria-hidden", "true");
              otherAnswer.style.maxHeight = null;
            }
            other.classList.remove("is-open");
          }
        });

        /* Toggle clicked item */
        if (isOpen) {
          btn.setAttribute("aria-expanded", "false");
          if (answer) {
            answer.setAttribute("aria-hidden", "true");
            answer.style.maxHeight = null;
          }
          btn.classList.remove("is-open");
        } else {
          btn.setAttribute("aria-expanded", "true");
          if (answer) {
            answer.setAttribute("aria-hidden", "false");
            answer.style.maxHeight = answer.scrollHeight + "px";
          }
          btn.classList.add("is-open");
        }
      });
    });
  }

  /* ── Wire up data-back buttons injected dynamically ── */
  function attachBackButtons(container) {
    container.querySelectorAll("[data-back]").forEach((btn) => {
      btn.addEventListener("click", () => {
        /* showScreen is defined in app.js — safe to call since faq.js
           is loaded after app.js in index.html */
        const target = btn.dataset.back;
        const screens = document.querySelectorAll(".screen");
        screens.forEach((s) =>
          s.classList.toggle("is-active", s.dataset.screen === target)
        );
        window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
        document.querySelectorAll(".nav-link").forEach((l) =>
          l.classList.remove("active")
        );
        const activeLink = document.querySelector(
          `.nav-link[data-screen="${target}"]`
        );
        if (activeLink) activeLink.classList.add("active");
      });
    });
  }

  /* ── Inject JSON-LD FAQ schema for Google AEO ── */
  function injectFaqSchema(schemaItems) {
    if (!schemaItems || !schemaItems.length) return;

    const existing = document.getElementById("faq-jsonld");
    if (existing) existing.remove();

    const faqPage = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": schemaItems.map((item) => ({
        "@type": "Question",
        "name": item.q,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.a
        }
      }))
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "faq-jsonld";
    script.textContent = JSON.stringify(faqPage);
    document.head.appendChild(script);
  }

  /* ── Main init ── */
  function initFaq() {
    const faqScreen = document.querySelector('[data-screen="faq"]');
    if (!faqScreen) return;

    /* Show a loading state while fetching */
    faqScreen.innerHTML = `
      <div class="screen__inner about-inner" style="text-align:center;padding-top:4rem;">
        <div class="loader-ring"></div>
        <p class="loader-text" style="margin-top:1rem;">loading faq…</p>
      </div>`;

    fetch(FAQ_DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load FAQ data (" + res.status + ")");
        return res.json();
      })
      .then((data) => {
        faqScreen.innerHTML = buildFaqHTML(data);
        attachAccordion(faqScreen);
        attachBackButtons(faqScreen);
        injectFaqSchema(data.schema_faq || []);
      })
      .catch((err) => {
        console.error("[FAQ] Load error:", err);
        faqScreen.innerHTML = `
          <div class="screen__inner about-inner" style="text-align:center;padding-top:4rem;">
            <p class="eyebrow">⚠ oops</p>
            <p class="lede">Couldn't load the FAQ right now. <br>Try refreshing the page.</p>
            <button type="button" class="ghost-btn" style="margin-top:1.5rem;" data-back="domain">← back to app</button>
          </div>`;
        attachBackButtons(faqScreen);
      });
  }

  /* Run after DOM is ready */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFaq);
  } else {
    initFaq();
  }
})();