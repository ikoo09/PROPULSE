module.exports = async function handler(req, res) {
  // Setup CORS agar bisa diakses dari frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan metode POST" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API Key belum diatur di Environment Variables Vercel." });

  try {
    // Perbaikan: Menggunakan gemini-1.5-flash karena paling stabil untuk tier gratis
    // dan sepenuhnya mendukung fitur Google Search Grounding.
    const modelName = "gemini-1.5-flash"; 
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${gemini-1.5-flas}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      // Penanganan khusus jika terkena Rate Limit (429)
      if (response.status === 429) {
        return res.status(429).json({ 
          error: "Batas limit AI tercapai (15 RPM). Sistem mengerem sejenak...",
          type: "RATE_LIMIT"
        });
      }
      // Return error bawaan dari Google jika ada error lain
      return res.status(response.status).json(data);
    }

    // Jika sukses, kembalikan data ke frontend
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: "Koneksi ke server Google AI terputus." });
  }
};