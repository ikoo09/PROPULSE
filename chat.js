// Fungsi penunjang / helper eksternal (Jika digunakan dalam scope lain pada aplikasi Anda)
async function askGemini(payload, isHeavyTask = false) {

  // Menyisipkan penanda model berdasarkan tugas yang diminta
  // Model yang ringan memakai 2.5, Model komputasi berat memakai 3.1
  payload.model = isHeavyTask ? "gemini-3.1-flash-lite" : "gemini-2.5-flash-lite";

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("Gagal mendapatkan respons dari API:", text);
    throw new Error(text);
  }

  return JSON.parse(text);
}