// api/chat.js
export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { userInput } = req.body;
  const apiKey = process.env.GEMINI_API_KEY; // Kunci ini diambil dari Vercel

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: userInput }] }] })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghubungi Gemini' });
  }
}