// api/gemini.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API Key belum diatur di Vercel." });

  try {
    // Menggunakan gemini-1.5-flash: Sangat cepat dan paling cocok untuk tier gratis (Free Tier)
    const modelName = "gemini-3.1-Flash Lite"; 
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      // Jika error 429, berikan instruksi spesifik ke frontend
      if (response.status === 429) {
        return res.status(429).json({ 
          error: "Batas limit AI tercapai. Silakan tunggu 60 detik sebelum mencoba lagi.",
          type: "RATE_LIMIT"
        });
      }
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: "Koneksi ke server AI terputus." });
  }
};