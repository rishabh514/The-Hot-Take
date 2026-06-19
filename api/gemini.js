// This Map stores IP addresses and their request counts in the server's memory
const rateLimitMap = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

  // --- IP RATE LIMITER START ---
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-ip';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 5; // Max 5 topic generations per minute

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
  } else {
    const limitData = rateLimitMap.get(ip);
    if (now - limitData.startTime > windowMs) {
      // Time window passed, reset their count
      rateLimitMap.set(ip, { count: 1, startTime: now });
    } else {
      limitData.count++;
      if (limitData.count > maxRequests) {
        return res.status(429).json({ error: { message: 'Whoa, slow down! You are generating too many topics. Wait 60 seconds.' } });
      }
    }
  }
  // --- IP RATE LIMITER END ---

  // Safety check: Is the Vercel environment variable actually loaded?
  if (!process.env.GEMINI_API_KEY) {
    return res.status(400).json({ error: { message: 'Vercel is missing the GEMINI_API_KEY environment variable.' } });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    
    // CRITICAL FIX: Pass along the ACTUAL status code from Google (so 400s trigger errors)
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
}