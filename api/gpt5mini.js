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
    // 1. CEK CACHE REDIS (CACHE 6 JAM)
    // ==========================
    let cacheKey = null;

    if (feature === "trend" && input && UPSTASH_URL && UPSTASH_TOKEN) {
      cacheKey = `fbpro:trend:${Buffer.from(input).toString('base64').substring(0, 150)}`;
      
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
            console.log("Redis Cache HIT 🔥 ->", cacheKey);
            
            // Parsing format penyimpanan baru yang berisi timestamp
            let parsedCache;
            try {
                parsedCache = JSON.parse(cacheData.result);
            } catch(e) {
                // Fallback jika format lama masih tersimpan
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
    }

    // ==========================
    // 2. REQUEST KE OPENAI
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
    // 3. SIMPAN KE REDIS (EX: 21600 Detik = 6 Jam)
    // ==========================
    if (feature === "trend" && cacheKey && text && UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        const payloadToSave = JSON.stringify({ text: text, timestamp: currentTimestamp });
        
        const setRes = await fetch(UPSTASH_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${UPSTASH_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(["SET", cacheKey, payloadToSave, "EX", 21600])
        });

        if (setRes.ok) console.log("Berhasil menyimpan ke Redis 💾 ->", cacheKey);
      } catch (redisError) {
        console.error("Gagal menyimpan ke Redis:", redisError.message);
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