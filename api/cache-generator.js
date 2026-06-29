// api/cache-generator.js
const AI_MODEL = "openai/gpt-5-mini"; // GANTI: Jangan pakai gpt-5-mini

module.exports = async function handler(req, res) {
    const apiKey = process.env.OPENAI_API_KEY;
    const UPSTASH_URL = process.env.STORAGE_KV_REST_API_URL; // Gunakan variabel Vercel
    const UPSTASH_TOKEN = process.env.STORAGE_KV_REST_API_TOKEN;

    if (!UPSTASH_URL || !apiKey) return res.status(500).json({ error: "Variabel lingkungan belum lengkap." });

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
        
        // Pengaman jika AI Error
        if (!data.output || data.output.length === 0) {
            console.error("AI Response Error:", data);
            throw new Error("AI tidak memberikan jawaban. Cek API Key atau Saldo AI Anda.");
        }

        let text = "";
        for (const item of data.output) {
            if (item.content) {
                for (const c of item.content) if (c.text) text += c.text;
            }
        }
        return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
    }

    try {
        // 1. GENERATE TREND
        const trendPrompt = `Berikan 7 tren FB Reels viral di Indonesia hari ini. Kategori: Hiburan, Kuliner, Gaming, Edukasi, Vlog, Kecantikan, Bisnis.`;
        const trendSchema = { type: "OBJECT", properties: { trends: { type: "ARRAY", items: { type: "OBJECT", properties: { kategori: {type:"STRING"}, title: {type:"STRING"}, desc: {type:"STRING"}, hook: {type:"STRING"} } } } } };
        
        const trendData = await callAI(trendPrompt, trendSchema);

        // Validasi data sebelum lanjut
        if (!trendData || !trendData.trends) {
            throw new Error("Format JSON AI tidak sesuai.");
        }

        // 2. GENERATE SCRIPT (Gunakan Data dari AI)
        const scriptsData = {};
        for (let i = 0; i < trendData.trends.length; i++) {
            const trend = trendData.trends[i];
            const scriptPrompt = `Buat naskah Reels untuk: "${trend.title}". Berikan scores (0-100) untuk viral, hook, retensi, share.`;
            const scriptSchema = { type: "OBJECT", properties: { analisis: {type: "STRING"}, hook: {type: "STRING"}, script: {type: "STRING"}, scores: { type: "OBJECT", properties: { viral: {type: "INTEGER"}, hook: {type: "INTEGER"}, retensi: {type: "INTEGER"}, share: {type: "INTEGER"} } } } };
            
            try {
                scriptsData[i] = await callAI(scriptPrompt, scriptSchema);
            } catch(e) { scriptsData[i] = null; }
        }

        // 3. SIMPAN KE REDIS
        const timestamp = Date.now();
        await fetch(UPSTASH_URL, {
            method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(["MSET", 
                "fbpro:static:trends", JSON.stringify({ data: trendData.trends, timestamp }),
                "fbpro:static:scripts", JSON.stringify({ data: scriptsData, timestamp })
            ])
        });

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error("Generator Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
}