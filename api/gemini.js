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
    // PERBAIKAN UTAMA: Menggunakan model yang valid dan super cepat untuk tier gratis
    const modelName = "gemini-1.5-flash"; 
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      }
    );

    const data = await response.json();

    // PERBAIKAN ERROR HANDLING: Tangkap error spesifik dari Google API
    if (!response.ok) {
      // Tangani Rate Limit (429) sesungguhnya
      if (response.status === 429) {
        return res.status(429).json({ 
          error: "Batas limit AI tercapai (15 RPM). Sistem mengerem sejenak...",
          type: "RATE_LIMIT"
        });
      }
      
      // Kirim pesan error asli dari Google ke frontend (Bukan sekedar error "Limit")
      return res.status(response.status).json({
        error: data.error?.message || "Terjadi kesalahan pada server AI Google.",
        type: "API_ERROR",
        details: data
      });
    }

    // Jika sukses, kembalikan data ke frontend
    return res.status(200).json(data);
    
  } catch (error) {
    return res.status(500).json({ 
      error: "Gagal menghubungi server Gemini.",
      details: error.message 
    });
  }
}