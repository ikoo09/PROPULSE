// api/trends.js
// Endpoint untuk Frontend (chat.js) membaca tren.
// SANGAT CEPAT, 0% Penggunaan AI, Murni membaca Redis.

module.exports = async function handler(req, res) {
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!UPSTASH_URL) {
        return res.status(500).json({ error: "Redis (Upstash) belum dikonfigurasi di Environment." });
    }

    try {
        // Catat Redis Hit (Untuk Dashboard)
        fetch(UPSTASH_URL, {
            method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(["INCR", "fbpro:stats:redis_hits"])
        }).catch(() => {});

        // Ambil Data Tren dan Script Statis secara paralel
        const redisRes = await fetch(UPSTASH_URL, {
            method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(["MGET", "fbpro:static:trends", "fbpro:static:scripts", "fbpro:stats:last_api_calls", "fbpro:stats:redis_hits"])
        });

        const data = await redisRes.json();
        const results = data.result || [];

        const trendsStr = results[0];
        const scriptsStr = results[1];
        
        if (!trendsStr) {
            return res.status(200).json({ 
                status: "empty", 
                message: "Sistem belum melakukan auto-generate. Menunggu Cron Job berjalan." 
            });
        }

        const trendsObj = JSON.parse(trendsStr);
        const scriptsObj = JSON.parse(scriptsStr || "{}");

        return res.status(200).json({
            status: "success",
            trends: trendsObj.data,
            scripts: scriptsObj.data,
            metadata: {
                timestamp: trendsObj.timestamp,
                apiCallsToday: results[2] || 0,
                redisHits: results[3] || 0
            }
        });

    } catch (e) {
        return res.status(500).json({ error: "Gagal mengambil data statis." });
    }
}