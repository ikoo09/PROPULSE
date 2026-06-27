module.exports = async function handler(req, res) {
  // Setup CORS agar bisa diakses dari frontend dengan aman
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request dari browser
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan metode POST" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API Key belum diatur di Environment Variables Vercel." });

  try {
    // Membaca model yang dikirimkan dari frontend (Default ke Flash Lite 2.5)
    // Ini mengaktifkan logika penggunaan 2 AI sesuai permintaan
    const requestedModel = req.body.model || "gemini-3.1-flash-lite"; 
    
    // Menghapus properti 'model' dari body agar tidak bertabrakan dengan schema request Gemini
    const bodyPayload = { ...req.body };
    delete bodyPayload.model;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${requestedModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        return res.status(429).json({ 
          error: "Batas limit AI tercapai (15 RPM). Sistem mengerem sejenak...",
          type: "RATE_LIMIT"
        });
      }
      
      return res.status(response.status).json({
        error: data.error?.message || "Terjadi kesalahan pada server AI Google.",
        type: "API_ERROR",
        details: data
      });
    }

    return res.status(200).json(data);
    
  } catch (error) {
    return res.status(500).json({ 
      error: "Gagal menghubungi server Gemini.",
      details: error.message 
    });
  }
}