let memoryCache = {};
let memoryHistory = [];

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

  try {
    const body = req.body || {};
    const action = body.action || null;

    // ==========================
    // ENDPOINT SPESIFIK & HISTORY
    // ==========================
    if (action === 'cache_status') {
        if (!UPSTASH_URL) return res.status(200).json({ status: 'no_redis', source: 'memory' });
        try {
            const resRedis = await fetch(UPSTASH_URL, {
                method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify(["TTL", "fbpro:trend:global_trends_v1"])
            });
            const data = await resRedis.json();
            return res.status(200).json({ source: 'redis', ttl_seconds: data.result });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    }

    if (action === 'history_save') {
        if (UPSTASH_URL) {
            try {
                const itemStr = JSON.stringify(body.item);
                await fetch(UPSTASH_URL, {
                     method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                     body: JSON.stringify(["LPUSH", "fbpro:global_history", itemStr])
                });
                await fetch(UPSTASH_URL, {
                     method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                     body: JSON.stringify(["LTRIM", "fbpro:global_history", "0", "14"])
                });
            } catch(e) { console.error("Redis History Save Error", e); }
        } else {
            memoryHistory.unshift(body.item);
            if(memoryHistory.length > 15) memoryHistory = memoryHistory.slice(0, 15);
        }
        return res.status(200).json({ success: true });
    }

    if (action === 'history_get') {
        if (UPSTASH_URL) {
            try {
                const resRedis = await fetch(UPSTASH_URL, {
                     method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                     body: JSON.stringify(["LRANGE", "fbpro:global_history", "0", "-1"])
                });
                const d = await resRedis.json();
                const history = (d.result || []).map(x => JSON.parse(x));
                return res.status(200).json({ history });
            } catch(e) { return res.status(200).json({ history: memoryHistory }); }
        }
        return res.status(200).json({ history: memoryHistory });
    }

    if (action === 'history_clear') {
        if (UPSTASH_URL) {
            await fetch(UPSTASH_URL, {
                 method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                 body: JSON.stringify(["DEL", "fbpro:global_history"])
            });
        }
        memoryHistory = [];
        return res.status(200).json({ success: true });
    }

    // ==========================
    // AI GENERATION LOGIC
    // ==========================
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY belum diatur di Vercel." });
    }

    const feature = body.feature || null; 
    const bypassCache = body.bypassCache || false; 
    const cacheId = body.cacheId || null; 
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
    // 1. CEK LAYER 2 (REDIS) & LOCK
    // ==========================
    let cacheKey = null;

    if ((feature === "trend" || feature === "script")) {
      if (cacheId) {
          cacheKey = `fbpro:${feature}:${cacheId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      } else if (input) {
          const crypto = require('crypto');
          const hash = crypto.createHash('sha256').update(input).digest('hex');
          cacheKey = `fbpro:${feature}:${hash}`;
      }
      
      if (cacheKey && !bypassCache) {
        if (UPSTASH_URL && UPSTASH_TOKEN) {
            try {
              const cacheRes = await fetch(UPSTASH_URL, {
                method: "POST",
                headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify(["GET", cacheKey])
              });
              
              if (cacheRes.ok) {
                const cacheData = await cacheRes.json();
                
                // --- JIKA DATA REDIS ADA (REDIS HIT) ---
                if (cacheData.result) {
                  console.log(`REDIS HIT`);
                  console.log(`-> Data didapat dari Redis: ${cacheKey}`);
                  
                  let parsedCache;
                  try {
                      parsedCache = JSON.parse(cacheData.result);
                  } catch(e) {
                      parsedCache = { text: cacheData.result, timestamp: Date.now() };
                  }
      
                  // WAJIB RETURN DISINI UNTUK MENCEGAH RE-GENERATE
                  return res.status(200).json({
                    candidates: [{ content: { parts: [{ text: parsedCache.text }] } }],
                    metadata: { cached: true, timestamp: parsedCache.timestamp, source: 'redis' }
                  });
                }

                // --- JIKA REDIS KOSONG (MISS) -> TERAPKAN LOCK ---
                console.log(`REDIS MISS -> Menerapkan Redis Lock untuk: ${cacheKey}`);
                const lockKey = `fbpro_lock_${cacheKey}`;
                const lockRes = await fetch(UPSTASH_URL, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                  body: JSON.stringify(["SET", lockKey, "1", "NX", "EX", 30]) // Kunci 30 Detik
                });
                
                const lockData = await lockRes.json();
                if (lockData.result !== "OK") {
                  // Ada request lain yg sedang generate! Polling dan tunggu.
                  console.log(`🔒 Request lain sedang generate. Menunggu hasil (Polling)...`);
                  for (let i = 0; i < 5; i++) {
                      await new Promise(r => setTimeout(r, 2000)); // Tunggu 2 detik per iterasi
                      const retryRes = await fetch(UPSTASH_URL, {
                          method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                          body: JSON.stringify(["GET", cacheKey])
                      });
                      const retryData = await retryRes.json();
                      
                      if (retryData.result) {
                          console.log(`REDIS HIT`);
                          console.log(`-> Data didapat setelah menunggu antrean Lock: ${cacheKey}`);
                          let parsedCache;
                          try { parsedCache = JSON.parse(retryData.result); } 
                          catch(e) { parsedCache = { text: retryData.result, timestamp: Date.now() }; }
                          
                          return res.status(200).json({
                              candidates: [{ content: { parts: [{ text: parsedCache.text }] } }],
                              metadata: { cached: true, timestamp: parsedCache.timestamp, source: 'redis' }
                          });
                      }
                  }
                  console.log(`⚠️ Polling Lock Timeout, mengizinkan generate fallback untuk: ${cacheKey}`);
                }
              }
            } catch (redisError) {
              console.error("❌ Gagal membaca Redis Cache:", redisError.message);
            }
        }
        
        // --- FALLBACK KE MEMORY LOKAL LAMBDA ---
        if (memoryCache[cacheKey] && (Date.now() - memoryCache[cacheKey].timestamp < 43200000)) {
            console.log(`MEMORY HIT -> ${cacheKey}`);
            return res.status(200).json({
              candidates: [{ content: { parts: [{ text: memoryCache[cacheKey].text }] } }],
              metadata: { cached: true, timestamp: memoryCache[cacheKey].timestamp, source: 'memory' }
            });
        }

      } else if (bypassCache) {
        console.log(`⏩ Sinyal Bypass Diterima -> ${cacheKey}`);
      }
    }

    // ==========================
    // 2. REQUEST KE OPENAI (Jika Lapis 2 & Memory kosong)
    // ==========================
    console.log(`🤖 Memicu Generate AI baru untuk: ${cacheKey || 'Manual Request'}`);
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
    // 3. SIMPAN KE REDIS & HAPUS LOCK
    // ==========================
    if ((feature === "trend" || feature === "script") && cacheKey && text) {
      
      let isValidJson = false;
      try {
          let cleanText = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          JSON.parse(cleanText);
          isValidJson = true;
      } catch(e) {
          console.warn("⚠️ Respons AI bukan JSON yang valid. Membatalkan penyimpanan cache.");
      }

      if (isValidJson) {
          const payloadToSave = JSON.stringify({ text: text, timestamp: currentTimestamp });
          memoryCache[cacheKey] = { text: text, timestamp: currentTimestamp }; // Memory Fallback
          
          if (UPSTASH_URL && UPSTASH_TOKEN) {
              try {
                const redisCommand = ["SET", cacheKey, payloadToSave, "EX", 43200];
                const setRes = await fetch(UPSTASH_URL, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                  body: JSON.stringify(redisCommand)
                });
    
                if (setRes.ok) {
                    const resData = await setRes.json();
                    if (resData.result === "OK") {
                        console.log(`✅ Berhasil menyimpan Redis (TTL 12 Jam) -> ${cacheKey}`);
                    } else {
                        console.warn(`⚠️ Redis merespons tidak OK saat SET -> ${cacheKey}`);
                    }
                    
                    // Lepaskan lock
                    await fetch(UPSTASH_URL, {
                      method: "POST",
                      headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
                      body: JSON.stringify(["DEL", `fbpro_lock_${cacheKey}`])
                    });
                } else {
                    console.error(`❌ Gagal menyimpan ke Redis (HTTP ${setRes.status}) -> ${cacheKey}`);
                }
              } catch (redisError) {
                console.error("❌ Exception saat proses Redis SET/DEL:", redisError.message);
              }
          }
      }
    }

    return res.status(200).json({
      candidates: [{ content: { parts: [{ text }] } }],
      metadata: { cached: false, timestamp: currentTimestamp, source: 'ai' }
    });

  } catch (err) {
    return res.status(500).json({
      error: "Gagal memproses request.",
      details: err.message
    });
  }
};