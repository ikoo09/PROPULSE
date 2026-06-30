// api/cron.js
const AI_MODEL = "openai/gpt-5-mini";

module.exports = async function handler(req, res) {
    const apiKey = process.env.OPENAI_API_KEY;
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;

    // 1. Cek Variabel Lingkungan
    if (!UPSTASH_URL || !apiKey) {
        console.error("❌ ERROR: Variabel lingkungan OPENAI_API_KEY atau UPSTASH belum lengkap/kosong.");
        return res.status(500).json({ error: "Variabel lingkungan API Key atau Redis belum lengkap." });
    }

    async function callAI(prompt, schema) {
        const response = await fetch("https://api.koboillm.com/v1/responses", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: AI_MODEL,
                input: [
                    { role: "system", content: [{ type: "input_text", text: "Anda sistem API murni. HANYA hasilkan JSON valid tanpa teks pengantar, markdown, atau basa-basi." }] },
                    { role: "user", content: [{ type: "input_text", text: prompt + `\n\nWAJIB RETURN JSON SESUAI SCHEMA INI:\n${JSON.stringify(schema)}` }] }
                ]
            })
        });
        
        const data = await response.json();
        if (!data.output || data.output.length === 0) throw new Error("AI tidak merespons atau token habis.");

        let text = "";
        for (const item of data.output) if (item.content) for (const c of item.content) if (c.text) text += c.text;
        
        try {
            text = text.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            return JSON.parse(text);
        } catch (e) {
            const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (match) return JSON.parse(match[0]);
            throw new Error("Format AI Error: Gagal mengekstrak JSON dari respons.");
        }
    }

    try {
        console.log("🚀 Memulai proses Cron Job: Generate Trend...");
        
        // 2. GENERATE TREND
        const trendPrompt = `Berikan 7 tren FB Reels viral di Indonesia hari ini secara singkat. Kategori: Hiburan, Kuliner, Gaming, Edukasi, Vlog, Kecantikan, Bisnis.`;
        const trendSchema = { type: "OBJECT", properties: { trends: { type: "ARRAY", items: { type: "OBJECT", properties: { kategori: {type:"STRING"}, title: {type:"STRING"}, desc: {type:"STRING"}, hook: {type:"STRING"} } } } } };
        
        const trendData = await callAI(trendPrompt, trendSchema);
        if (!trendData || !trendData.trends) throw new Error("Format AI Error: Struktur Trend Kosong");

        console.log("✅ Trend berhasil didapat, memproses script secara paralel...");

        // 3. PARALEL GENERATE SCRIPTS
        const scriptPromises = trendData.trends.map(async (trend, index) => {
            const scriptPrompt = `Buat naskah singkat Reels untuk: "${trend.title}". Harus ada analisis, target_audiens, hook, script, cta, caption, hashtags. Berikan scores (0-100).`;
            const scriptSchema = { type: "OBJECT", properties: { analisis: {type: "STRING"}, target_audiens: {type: "STRING"}, hook: {type: "STRING"}, script: {type: "STRING"}, cta: {type: "STRING"}, caption: {type: "STRING"}, hashtags: {type: "STRING"}, scores: { type: "OBJECT", properties: { viral: {type: "INTEGER"}, hook: {type: "INTEGER"}, retensi: {type: "INTEGER"}, share: {type: "INTEGER"} } } } };
            try {
                const data = await callAI(scriptPrompt, scriptSchema);
                return { index, data };
            } catch(e) { return { index, data: null }; } 
        });

        const resolvedScripts = await Promise.all(scriptPromises);
        const scriptsData = {};
        resolvedScripts.forEach(res => { scriptsData[res.index] = res.data; });

        console.log("💾 Menyimpan data tren dan script ke Redis Upstash...");

        // 4. SIMPAN KE REDIS
        const timestamp = Date.now();
        const redisReq = await fetch(UPSTASH_URL, {
            method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(["MSET", 
                "fbpro:static:trends", JSON.stringify({ data: trendData.trends, timestamp }),
                "fbpro:static:scripts", JSON.stringify({ data: scriptsData, timestamp })
            ])
        });

        if(!redisReq.ok) throw new Error("Gagal menyimpan ke Redis Upstash.");

        console.log("🎉 Cron berhasil dijalankan tanpa hambatan!");
        return res.status(200).json({ success: true, message: "Cache berhasil diperbarui otomatis oleh Cron." });
        
    } catch (err) {
        console.error("❌ CRON ERROR:", err.message);
        return res.status(500).json({ error: "Generator gagal", details: { error: err.message } });
    }
}