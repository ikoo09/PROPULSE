// Handler API Serverless Vercel
module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Metode tidak diizinkan. Gunakan POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Konfigurasi Error: Environment variable 'GEMINI_API_KEY' belum diatur di dashboard Vercel Anda."
    });
  }

  try {
    // Menggunakan alias "-latest" agar Google API dapat menemukan modelnya
    const modelName = "gemini-3.1-flash-lite"; 
    
    // Jika masih gagal juga, Anda bisa mencoba mengubah modelName di atas menjadi:
    // const modelName = "gemini-pro";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req.body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Terjadi kesalahan dari API Gemini.",
        details: data
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: "Server Error internal saat menghubungi Gemini API",
      message: error.message
    });
  }
};