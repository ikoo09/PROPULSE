export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userInput } = req.body;

  // Validasi Input: Pastikan user mengirim pesan
  if (!userInput || typeof userInput !== 'string' || userInput.trim() === '') {
    return res.status(400).json({ error: 'Pesan tidak boleh kosong' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // Validasi Environment Variable
  if (!apiKey) {
    return res.status(500).json({ error: 'Konfigurasi server salah (Missing API Key)' });
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userInput }] }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Gagal terhubung ke Gemini API');
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      throw new Error('Respons AI tidak ditemukan');
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({ error: 'Terjadi kesalahan saat memproses permintaan Anda' });
  }
}