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
    // 1. CEK LAYER 2: CACHE REDIS (Siklus 12 Jam untuk Trend, Permanen untuk Script)
    // ==========================
    let cacheKey = null;

    // Abaikan pembacaan Redis jika bypassCache true
    if ((feature === "trend" || feature === "script") && input && UPSTASH_URL && UPSTASH_TOKEN) {
      
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(input).digest('hex');
      cacheKey = `fbpro:${feature}:${hash}`;
      
      if (!bypassCache) {
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
              console.log(`Lapis 2 (Redis) HIT 🔥 -> ${cacheKey}`);
              
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
      } else {
        console.log(`Sinyal Bypass Diterima: Melewati pembacaan Redis -> ${cacheKey}`);
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
          console.warn("Respons AI bukan JSON yang valid. Melewati penyimpanan Redis.");
      }

      if (isValidJson) {
          try {
            const payloadToSave = JSON.stringify({ text: text, timestamp: currentTimestamp });
            
            let redisCommand;
            if (feature === "trend") {
                // Diperbarui: Cache Redis kini di set 12 Jam (43200 Detik) menyesuaikan permintaan
                redisCommand = ["SET", cacheKey, payloadToSave, "EX", 43200];
            } else {
                // Cache Script tetap permanen
                redisCommand = ["SET", cacheKey, payloadToSave];
            }

            const setRes = await fetch(UPSTASH_URL, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${UPSTASH_TOKEN}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(redisCommand)
            });

            if (setRes.ok) console.log(`Berhasil menyimpan/memperbarui Redis 💾 -> ${cacheKey}`);
          } catch (redisError) {
            console.error("Gagal menyimpan ke Redis:", redisError.message);
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