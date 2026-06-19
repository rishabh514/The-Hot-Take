export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

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