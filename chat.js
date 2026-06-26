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
    // Teruskan request ke endpoint streaming Google
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:streamGenerateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Gagal terhubung ke Gemini API');
    }

    // Set header agar browser mengerti ini adalah stream data
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Membaca response dari Google sebagai stream dan meneruskannya ke frontend
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    return res.end();
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
async function triggerFacebookAutomation(taskType) {
    // Simulasi integrasi ke API Meta
    const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
    const url = `https://graph.facebook.com/v20.0/me/feed?access_token=${ACCESS_TOKEN}`;
    
    // Logika AI menentukan konten apa yang diposting
    // Contoh: AI membuat caption, lalu dikirim via POST ke FB
}

// Modifikasi response untuk menerima instruksi automasi
if (payload.action === 'RUN_AUTO_POST') {
    await triggerFacebookAutomation('POST');
}