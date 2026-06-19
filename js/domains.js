/* ============================================================
   THE HOT TAKE — Domain definitions
   15 lanes across 4 clusters
   ============================================================ */

const DOMAINS = [
  // ---------- Culture & Digital Life ----------
  {
    id: "pop-culture",
    cluster: "culture",
    name: "Pop Culture & Internet Lore",
    short: "Dive into the creator economy, viral phenomena, and internet history.",
    icon: "📱",
    blurb: "memes, the creator economy, viral phenomena, internet history",
    fallback: [
      "Why TikTok ruined (or saved) modern humor.",
      "The worst internet trend that everyone secretly loved.",
      "Defend a 'cringe' creator who actually understands the internet."
    ]
  },
  {
    id: "anime-manga",
    cluster: "culture",
    name: "Anime & Manga",
    short: "Break down tropes, character arcs, and world-building in Japanese animation.",
    icon: "⛩️",
    blurb: "tropes, world-building, character development in Japanese animation",
    fallback: [
      "The anime villain who was actually 100% right.",
      "Why the 'power of friendship' trope is actually brilliant (or garbage).",
      "The most overrated anime masterpiece and exactly why it fails."
    ]
  },
  {
    id: "gaming-esports",
    cluster: "culture",
    name: "Gaming & Esports",
    short: "Debate game design, industry shifts, and competitive gaming culture.",
    icon: "🎮",
    blurb: "game design philosophy, industry shifts, competitive gaming culture",
    fallback: [
      "Why modern AAA games feel completely soulless compared to indie titles.",
      "The worst mechanic in competitive multiplayer games right now.",
      "Are video games getting way too long, or are we just impatient?"
    ]
  },
  {
    id: "movies-tv",
    cluster: "culture",
    name: "Movies & TV",
    short: "Critique cinematography, storytelling, and the chaos of modern fandoms.",
    icon: "🎬",
    blurb: "cinematography, storytelling, fandom dynamics",
    fallback: [
      "The greatest movie ending that everyone completely misunderstood.",
      "Why binge-watching completely ruined television storytelling.",
      "Defend a universally hated movie and explain why it's actually genius."
    ]
  },
  {
    id: "music-audio",
    cluster: "culture",
    name: "Music & Audio",
    short: "Explore genre evolution, production, and the cultural impact of artists.",
    icon: "🎧",
    blurb: "genre evolution, production, the cultural impact of artists",
    fallback: [
      "Why the traditional album format is dying, and why that’s a good thing.",
      "An artist who completely sold out but made better music because of it.",
      "The most overused and annoying sound in modern pop music."
    ]
  },

  // ---------- Lifestyle & Experiences ----------
  {
    id: "food-culinary",
    cluster: "lifestyle",
    name: "Food & Culinary Culture",
    short: "Argue about street food, gastronomy, and the raw emotion of cooking.",
    icon: "🍜",
    blurb: "street food, gastronomy, the emotional connection to cooking",
    fallback: [
      "The most overrated 'fancy' ingredient used in fine dining today.",
      "Why your favorite childhood snack actually tastes terrible now.",
      "The ultimate, undisputed king of fast food and why it holds the crown."
    ]
  },
  {
    id: "travel-exploration",
    cluster: "lifestyle",
    name: "Travel & Exploration",
    short: "Unpack digital nomadism, culture shocks, and the ethics of tourism.",
    icon: "🧭",
    blurb: "digital nomadism, cultural shocks, unconventional destinations",
    fallback: [
      "Why 'finding yourself' through travel is a complete myth.",
      "The worst tourist trap in the world that people still relentlessly defend.",
      "Why the absolute best vacations are the ones where everything goes wrong."
    ]
  },
  {
    id: "fashion-aesthetics",
    cluster: "lifestyle",
    name: "Fashion & Aesthetics",
    short: "Dissect internet core aesthetics, personal style, and fast fashion.",
    icon: "👁️",
    blurb: "internet aesthetics, personal style, sustainable fashion",
    fallback: [
      "Why the cultural obsession with 'quiet luxury' is incredibly boring.",
      "A terrible fashion trend from the past that needs to come back immediately.",
      "Why dressing strictly for comfort is ruining personal style."
    ]
  },
  {
    id: "fitness-biohacking",
    cluster: "lifestyle",
    name: "Fitness & Biohacking",
    short: "Evaluate modern wellness trends, longevity culture, and physical limits.",
    icon: "💪",
    blurb: "modern wellness trends, longevity, physical performance",
    fallback: [
      "Why the biohacking trend is essentially just astrology for tech bros.",
      "The absolute most useless piece of gym equipment that everyone still uses.",
      "Why motivation is a complete myth and discipline is all that matters."
    ]
  },

  // ---------- Mind & Society ----------
  {
    id: "mental-health",
    cluster: "mind",
    name: "Mental Health & Psychology",
    short: "Navigate modern therapy speak, burnout culture, and cognitive biases.",
    icon: "🧠",
    blurb: "therapy speak, burnout, cognitive biases",
    fallback: [
      "How internet 'therapy speak' is actively ruining normal human communication.",
      "Why modern 'hustle culture' is just burnout disguised as ambition.",
      "The popular self-care trend that actually makes people significantly more miserable."
    ]
  },
  {
    id: "relationships-dating",
    cluster: "mind",
    name: "Relationships & Dating",
    short: "Examine dating app dynamics, communication styles, and modern romance.",
    icon: "💬",
    blurb: "dating app dynamics, communication styles, boundaries",
    fallback: [
      "Why swipe-based dating apps have completely destroyed modern romance.",
      "A common relationship 'red flag' that is actually a massive green flag.",
      "Why the romantic concept of 'the one' is actively holding you back."
    ]
  },
  {
    id: "true-crime",
    cluster: "mind",
    name: "True Crime & Mysteries",
    short: "Analyze unsolved cases, the psychology of crime, and genre ethics.",
    icon: "🔍",
    blurb: "unsolved cases, the psychology of crime, ethics of the genre",
    fallback: [
      "Why our societal obsession with true crime media is actually highly unethical.",
      "The most baffling unsolved mystery that legitimately keeps you up at night.",
      "Why the 'armchair internet detective' trend does significantly more harm than good."
    ]
  },
  {
    id: "late-night-philosophy",
    cluster: "mind",
    name: "Late-Night Philosophy",
    short: "Ponder existential dread, simulation theory, and modern ethical dilemmas.",
    icon: "🌌",
    blurb: "existential dread, simulation theory, modern ethical dilemmas",
    fallback: [
      "If we are actually living in a simulation, why does it even matter?",
      "Why the relentless search for a 'life purpose' is a modern psychological trap.",
      "Is it genuinely better to be happy and ignorant, or miserable and highly aware?"
    ]
  },

  // ---------- Hustle & Future ----------
  {
    id: "tech-ai",
    cluster: "hustle",
    name: "Tech & AI",
    short: "Debate the future of work, software, and our relationship with devices.",
    icon: "🤖",
    blurb: "future of work, software ecosystems, our relationship with devices",
    fallback: [
      "The one human skill that AI will absolutely never be able to replace.",
      "Why we should completely and globally ban smartphones in schools.",
      "The most terrifying technological advancement currently flying under the radar."
    ]
  },
  {
    id: "business-finance",
    cluster: "hustle",
    name: "Business, Finance & Hustle",
    short: "Critique side gigs, crypto, creator-led businesses, and modern investing.",
    icon: "💸",
    blurb: "side gigs, crypto, creator-led businesses, investing",
    fallback: [
      "Why the 'passive income' dream sold by influencers is mostly a scam.",
      "The absolute worst financial advice constantly given to young people.",
      "Why the traditional 9-to-5 job is still far better than entrepreneurship for most."
    ]
  }
];

const CLUSTER_LABELS = {
  culture: "culture & digital life",
  lifestyle: "lifestyle & experiences",
  mind: "mind & society",
  hustle: "hustle & future"
};

function pickRandomDomain() {
  return DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
}

function getDomainById(id) {
  return DOMAINS.find(d => d.id === id);
}