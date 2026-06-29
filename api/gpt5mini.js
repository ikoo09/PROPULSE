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
    const feature = body.feature || null; 
    const bypassCache = body.bypassCache || false; // Menerima sinyal bypass dari frontend
    const cacheId = body.cacheId || null; // Identifier cache yang stabil dari frontend
    const model = body.model || "openai/gpt-5-mini";

    let input = "";
    if (body.contents && body.contents[0]?.parts?.[0]) {
      input = body.contents[0].parts[0].text;
    }

    let systemPrompt = "Kamu adalah AI Facebook Professional Indonesia.";
    if (body.systemInstruction?.parts?.[0]) {
      systemPrompt = body.systemInstruction.parts[0].text;
    }

    // ==========================
    // 1. CEK LAYER 2: CACHE REDIS (Siklus 12 Jam)
    // ==========================
    let cacheKey = null;

    if ((feature === "trend" || feature === "script") && UPSTASH_URL && UPSTASH_TOKEN) {
      // Gunakan cacheId yang stabil jika ada (misal judul), atau fallback hash prompt panjang
      if (cacheId) {
          cacheKey = `fbpro:${feature}:${cacheId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      } else if (input) {
          const crypto = require('crypto');
          const hash = crypto.createHash('sha256').update(input).digest('hex');
          cacheKey = `fbpro:${feature}:${hash}`;
      }
      
      if (cacheKey && !bypassCache) {
        try {
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
              console.log(`🚀 Lapis 2 (Redis) HIT -> ${cacheKey}`);
              
              let parsedCache;
              try {
                  parsedCache = JSON.parse(cacheData.result);
              } catch(e) {
                  parsedCache = { text: cacheData.result, timestamp: Date.now() };
              }
  
              return res.status(200).json({
                candidates: [{ content: { parts: [{ text: parsedCache.text }] } }],
                metadata: { cached: true, timestamp: parsedCache.timestamp }
              });
            }
          }
        } catch (redisError) {
          console.error("Gagal membaca Redis Cache:", redisError.message);
        }
      } else if (bypassCache) {
        console.log(`⏩ Sinyal Bypass Diterima: Melewati pembacaan Redis -> ${cacheKey}`);
      }
    }

    // ==========================
    // 2. REQUEST KE OPENAI (Jika Lapis 1 & Lapis 2 kosong/dibypass)
    // ==========================
    const response = await fetch("https://api.koboillm.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: [
            { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
            { role: "user", content: [{ type: "input_text", text: input }] }
          ]
        })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Terjadi kesalahan pada OpenAI.",
        details: data
      });
    }

    let text = "";
    if (data.output) {
      for (const item of data.output) {
        if (!item.content) continue;
        for (const c of item.content) {
          if (c.text) text += c.text;
        }
      }
    }

    const currentTimestamp = Date.now();

    // ==========================
    // 3. SIMPAN KE REDIS (Perbarui Lapis 2)
    // ==========================
    if ((feature === "trend" || feature === "script") && cacheKey && text && UPSTASH_URL && UPSTASH_TOKEN) {
      
      let isValidJson = false;
      try {
          let cleanText = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          JSON.parse(cleanText);
          isValidJson = true;
      } catch(e) {
          console.warn("⚠️ Respons AI bukan JSON yang valid. Membatalkan penyimpanan ke Redis untuk mencegah cache rusak.");
      }

      if (isValidJson) {
          try {
            const payloadToSave = JSON.stringify({ text: text, timestamp: currentTimestamp });
            
            // KEDUANYA (Trend dan Script) di set cache 12 Jam (43200 Detik)
            const redisCommand = ["SET", cacheKey, payloadToSave, "EX", 43200];

            const setRes = await fetch(UPSTASH_URL, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${UPSTASH_TOKEN}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(redisCommand)
            });

            // Tambahkan pengecekan keberhasilan Redis yang lebih ketat
            if (setRes.ok) {
                const resData = await setRes.json();
                if (resData.result === "OK") {
                    console.log(`✅ Berhasil menyimpan Redis (TTL 12 Jam) -> ${cacheKey}`);
                } else {
                    console.warn(`⚠️ Redis merespons tidak OK saat SET -> ${cacheKey}`, resData);
                }
            } else {
                console.error(`❌ Gagal menyimpan ke Redis (HTTP ${setRes.status}) -> ${cacheKey}`);
            }

          } catch (redisError) {
            console.error("❌ Exception saat proses Redis SET:", redisError.message);
          }
      }
    }

    return res.status(200).json({
      candidates: [{ content: { parts: [{ text }] } }],
      metadata: { cached: false, timestamp: currentTimestamp }
    });

  } catch (err) {
    return res.status(500).json({
      error: "Gagal memproses request.",
      details: err.message
    });
  }
};