export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

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