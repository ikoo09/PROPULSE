// api/trends.js
module.exports = async function handler(req, res) {
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
    
    if (!UPSTASH_URL) return res.status(500).json({ error: "Redis (Upstash) belum dikonfigurasi di Environment." });

    try {
        fetch(UPSTASH_URL, { method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(["INCR", "fbpro:stats:redis_hits"]) }).catch(() => {});

        const redisRes = await fetch(UPSTASH_URL, {
            method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(["MGET", "fbpro:static:trends", "fbpro:static:scripts", "fbpro:stats:last_api_calls", "fbpro:stats:redis_hits"])
        });

        const data = await redisRes.json();
        const results = data.result || [];

        const trendsStr = results[0];
        const scriptsStr = results[1];
        
        if (!trendsStr) return res.status(200).json({ status: "empty", message: "Cache kosong." });

        return res.status(200).json({
            status: "success",
            trends: JSON.parse(trendsStr).data,
            scripts: JSON.parse(scriptsStr || "{}").data,
            metadata: {
                timestamp: JSON.parse(trendsStr).timestamp,
                apiCallsToday: results[2] || 0,
                redisHits: results[3] || 0
            }
        });
    } catch (e) {
        return res.status(500).json({ error: "Gagal mengambil data statis." });
    }
}