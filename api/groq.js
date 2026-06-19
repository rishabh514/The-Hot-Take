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
  const maxRequests = 3; // Max 3 analyses per minute

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
        return res.status(429).json({ error: { message: 'Spam detected. You are submitting too fast. Wait 60 seconds.' } });
      }
    }
  }
  // --- IP RATE LIMITER END ---

  // Safety check: Is the Vercel environment variable actually loaded?
  if (!process.env.GROQ_API_KEY) {
    return res.status(400).json({ error: { message: 'Vercel is missing the GROQ_API_KEY environment variable.' } });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body) 
    });

    const data = await response.json();
    
    // CRITICAL FIX: Pass along the ACTUAL status code from Groq
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
}