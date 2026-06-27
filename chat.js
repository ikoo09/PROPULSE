async function askGemini(payload) {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // PERBAIKAN: Parsing response menjadi JSON baik saat sukses maupun gagal
    const data = await response.json();

    if (!response.ok) {
      console.error("API Error Response:", data);
      // Melempar error spesifik agar UI (index.html) bisa memunculkan Toast/Notifikasi yang akurat
      throw new Error(data.error || "Gagal mendapatkan respon dari AI.");
    }

    return data;
  } catch (error) {
    console.error("Fetch Execution Error:", error);
    throw error;
  }
}