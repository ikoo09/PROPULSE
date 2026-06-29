// api/cache-generator.js
const AI_MODEL = "openai/gpt-5-mini";

module.exports = async function handler(req, res) {
    const apiKey = process.env.OPENAI_API_KEY;
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;

    if (!UPSTASH_URL || !apiKey) return res.status(500).json({ error: "Variabel lingkungan API Key atau Redis belum lengkap." });

    async function callAI(prompt, schema) {
        const response = await fetch("https://api.koboillm.com/v1/responses", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: AI_MODEL,
                input: [
                    { role: "system", content: [{ type: "input_text", text: "Anda adalah pakar FB Pro. Jawab HANYA dengan format JSON." }] },
                    { role: "user", content: [{ type: "input_text", text: prompt + `\n\nFormat JSON:\n${JSON.stringify(schema)}` }] }
                ]
            })
        });
        
        const data = await response.json();
        if (!data.output || data.output.length === 0) throw new Error("AI tidak merespons.");

        let text = "";
        for (const item of data.output) if (item.content) for (const c of item.content) if (c.text) text += c.text;
        return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
    }

    try {
        // 1. GENERATE TREND
        const trendPrompt = `Berikan 7 tren FB Reels viral di Indonesia hari ini. Kategori: Hiburan, Kuliner, Gaming, Edukasi, Vlog, Kecantikan, Bisnis.`;
        const trendSchema = { type: "OBJECT", properties: { trends: { type: "ARRAY", items: { type: "OBJECT", properties: { kategori: {type:"STRING"}, title: {type:"STRING"}, desc: {type:"STRING"}, hook: {type:"STRING"} } } } } };
        
        const trendData = await callAI(trendPrompt, trendSchema);
        if (!trendData || !trendData.trends) throw new Error("Format AI Error");

        // 2. PARALEL GENERATE SCRIPTS (Untuk menghindari Timeout 10 Detik Vercel)
        const scriptPromises = trendData.trends.map(async (trend, index) => {
            const scriptPrompt = `Buat naskah Reels untuk: "${trend.title}". Harus ada analisis, target_audiens, hook, script, cta, caption, hashtags. Berikan scores (0-100) untuk viral, hook, retensi, share.`;
            const scriptSchema = { type: "OBJECT", properties: { analisis: {type: "STRING"}, target_audiens: {type: "STRING"}, hook: {type: "STRING"}, script: {type: "STRING"}, cta: {type: "STRING"}, caption: {type: "STRING"}, hashtags: {type: "STRING"}, scores: { type: "OBJECT", properties: { viral: {type: "INTEGER"}, hook: {type: "INTEGER"}, retensi: {type: "INTEGER"}, share: {type: "INTEGER"} } } } };
            try {
                const data = await callAI(scriptPrompt, scriptSchema);
                return { index, data };
            } catch(e) { return { index, data: null }; }
        });

        const resolvedScripts = await Promise.all(scriptPromises);
        const scriptsData = {};
        resolvedScripts.forEach(res => { scriptsData[res.index] = res.data; });

        // 3. SIMPAN KE REDIS
        const timestamp = Date.now();
        await fetch(UPSTASH_URL, {
            method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(["MSET", 
                "fbpro:static:trends", JSON.stringify({ data: trendData.trends, timestamp }),
                "fbpro:static:scripts", JSON.stringify({ data: scriptsData, timestamp })
            ])
        });

        return res.status(200).json({ success: true, message: "Cache berhasil diperbarui paralel." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}