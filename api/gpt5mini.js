// api/gpt5mini.js
// Fungsi AI Khusus Analisis URL & Pengelola Riwayat Global

let memoryHistory = [];

module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST." });

    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
    const body = req.body || {};
    const action = body.action || null;

    // --- FITUR RIWAYAT GLOBAL ---
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
            } catch(e) {}
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
            await fetch(UPSTASH_URL, { method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(["DEL", "fbpro:global_history"]) });
        }
        memoryHistory = [];
        return res.status(200).json({ success: true });
    }

    // --- FITUR ANALISIS URL ---
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY belum diatur." });

    try {
        const model = body.model || "openai/gpt-5-mini";
        let input = "";
        if (body.contents && body.contents[0]?.parts?.[0]) input = body.contents[0].parts[0].text;
        
        let systemPrompt = "Kamu adalah pakar bedah konten Facebook Reels Indonesia.";
        if (body.systemInstruction?.parts?.[0]) systemPrompt = body.systemInstruction.parts[0].text;

        const response = await fetch("https://api.koboillm.com/v1/responses", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                input: [
                    { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
                    { role: "user", content: [{ type: "input_text", text: input }] }
                ]
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Kesalahan API AI");

        let text = "";
        if (data.output) {
            for (const item of data.output) {
                if (!item.content) continue;
                for (const c of item.content) if (c.text) text += c.text;
            }
        }

        return res.status(200).json({
            candidates: [{ content: { parts: [{ text }] } }],
            metadata: { cached: false, source: 'ai_direct' }
        });
    } catch (err) {
        return res.status(500).json({ error: "Gagal memproses Analisis.", details: err.message });
    }
}