module.exports = async function handler(req, res) {
  // ==========================
  // CORS
  // ==========================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Gunakan metode POST."
    });
  }

  // ==========================
  // API KEY & UPSTASH ENV
  // ==========================
  const apiKey = process.env.OPENAI_API_KEY;
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY belum diatur di Vercel."
    });
  }

  try {
    const body = req.body || {};

    // Tangkap identifikasi fitur dari Frontend
    const feature = body.feature || null; 

    // Default Model
    const model = body.model || "gpt-5-mini";

    // Prompt utama
    let input = "";
    if (
      body.contents &&
      body.contents[0] &&
      body.contents[0].parts &&
      body.contents[0].parts[0]
    ) {
      input = body.contents[0].parts[0].text;
    }

    // System Prompt
    let systemPrompt = "Kamu adalah AI Facebook Professional Indonesia.";
    if (
      body.systemInstruction &&
      body.systemInstruction.parts &&
      body.systemInstruction.parts[0]
    ) {
      systemPrompt = body.systemInstruction.parts[0].text;
    }

    // ==========================
    // 1. CEK CACHE REDIS (KHUSUS TREND) VIA REST API
    // ==========================
    let cacheKey = null;

    if (feature === "trend" && input && UPSTASH_URL && UPSTASH_TOKEN) {
      // Buat key unik (hashing sederhana base64 dari input prompt)
      cacheKey = `fbpro:trend:${Buffer.from(input).toString('base64').substring(0, 150)}`;
      
      try {
        // Menggunakan fetch murni ke Upstash REST API untuk GET
        const cacheRes = await fetch(UPSTASH_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${UPSTASH_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(["GET", cacheKey])
        });
        
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          if (cacheData.result) {
            console.log("Redis Cache HIT 🔥 ->", cacheKey);
            // Jika ada di cache, langsung kembalikan tanpa hit OpenAI
            return res.status(200).json({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: cacheData.result
                      }
                    ]
                  }
                }
              ]
            });
          }
        }
        console.log("Redis Cache MISS ❌ ->", cacheKey);
      } catch (redisError) {
        console.error("Gagal membaca Redis Cache:", redisError.message);
        // Tetap lanjut ke OpenAI jika Redis bermasalah
      }
    }

    // ==========================
    // 2. REQUEST KE OPENAI
    // ==========================
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: systemPrompt
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: input
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    // ==========================
    // ERROR DARI OPENAI
    // ==========================
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Terjadi kesalahan pada OpenAI.",
        details: data
      });
    }

    // ==========================
    // Ambil Text
    // ==========================
    let text = "";

    if (data.output) {
      for (const item of data.output) {
        if (!item.content) continue;
        for (const c of item.content) {
          if (c.text) {
            text += c.text;
          }
        }
      }
    }

    // ==========================
    // 3. SIMPAN KE REDIS (KHUSUS TREND) VIA REST API
    // ==========================
    if (feature === "trend" && cacheKey && text && UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        // Simpan dengan TTL 21600 detik (6 jam) menggunakan sintaks perintah Redis dalam bentuk Array
        const setRes = await fetch(UPSTASH_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${UPSTASH_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(["SET", cacheKey, text, "EX", 21600])
        });

        if (setRes.ok) {
          console.log("Berhasil menyimpan ke Redis 💾 ->", cacheKey);
        }
      } catch (redisError) {
        console.error("Gagal menyimpan ke Redis:", redisError.message);
      }
    }

    // ==========================
    // Balikkan format ke Frontend
    // ==========================
    return res.status(200).json({
      candidates: [
        {
          content: {
            parts: [
              {
                text
              }
            ]
          }
        }
      ]
    });

  } catch (err) {
    return res.status(500).json({
      error: "Gagal memproses request.",
      details: err.message
    });
  }
};