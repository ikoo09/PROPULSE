export default async function handler(req, res) {
  // Hanya menerima metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Terima SELURUH body dari frontend (termasuk systemPrompt, tools, schema json)
  const payload = req.body;

  // Validasi Input
  if (!payload || !payload.contents) {
    return res.status(400).json({ error: 'Payload tidak valid atau kosong.' });
  }

  // Mengambil API Key dari Environment Variable Vercel
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Konfigurasi server salah (Missing API Key)' });
  }

  try {
    // Teruskan request sepenuhnya ke endpoint Google
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Gagal terhubung ke Gemini API');
    }

    // Tangkap data dari Google dan lempar kembali secara utuh ke Frontend
    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({ 
        error: 'Terjadi kesalahan saat memproses permintaan', 
        details: error.message 
    });
  }
}