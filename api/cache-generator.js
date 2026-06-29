// api/cache-generator.js
// Dipanggil oleh Cron Job setiap 12 Jam

const AI_MODEL = "openai/gpt-5-mini";

export default async function handler(req, res) {
    // Keamanan: Hanya eksekusi jika dipanggil oleh sistem / cron rahasia
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Hapus atau comment baris ini jika Anda belum mengatur CRON_SECRET di Vercel
        // return res.status(401).json({ error: "Unauthorized" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!UPSTASH_URL) return res.status(500).json({ error: "Redis diperlukan untuk mode statis." });

    let apiCallsCount = 0;

    async function callAI(prompt, schema) {
        apiCallsCount++;
        const response = await fetch("https://api.koboillm.com/v1/responses", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: AI_MODEL,
                input: [
                    { role: "system", content: [{ type: "input_text", text: "Anda adalah sistem GPT-5 Mini, konsultan strategi Facebook Pro. Jawab HANYA dengan format JSON valid." }] },
                    { role: "user", content: [{ type: "input_text", text: prompt + `\n\nWAJIB format JSON:\n${JSON.stringify(schema)}` }] }
                ]
            })
        });
        
        const data = await response.json();
        let text = "";
        if (data.output) {
            for (const item of data.output) {
                if (!item.content) continue;
                for (const c of item.content) if (c.text) text += c.text;
            }
        }
        return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
    }

    try {
        console.log("Memulai Generate Trend Global via Cron...");
        
        // 1. GENERATE TREND UTAMA
        const trendPrompt = `Berikan 7 ide tren konten FB Reels atau Video Pendek paling panas dan viral di Indonesia HARI INI. Berikan 1 tren terbaik untuk masing-masing kategori: 1. Umum/Hiburan, 2. Kuliner, 3. Gaming, 4. Edukasi, 5. Vlog Keseharian, 6. Kecantikan/Fashion, 7. Bisnis/Cuan. Buat judul tren, deskripsi singkat, nama kategori, dan contoh ide hook.`;
        const trendSchema = { type: "OBJECT", properties: { trends: { type: "ARRAY", items: { type: "OBJECT", properties: { kategori: { type: "STRING" }, title: { type: "STRING" }, desc: { type: "STRING" }, hook: { type: "STRING" } }, required: ["kategori", "title", "desc", "hook"] } } }, required: ["trends"] };
        
        const trendData = await callAI(trendPrompt, trendSchema);
        
        // 2. PRE-GENERATE SEMUA SCRIPT UNTUK MASING-MASING TREND
        const scriptsData = {};
        for (let i = 0; i < trendData.trends.length; i++) {
            const trend = trendData.trends[i];
            console.log(`Generate Script ${i+1}/7: ${trend.title}`);
            
            const scriptPrompt = `Buat naskah komprehensif untuk konten FB Reels terkait topik: "${trend.title}". Harus mencakup: 1. Analisis tren, 2. Target audiens, 3. Hook 3 detik, 4. Script narasi & visual, 5. CTA, 6. Caption, 7. Hashtag, Serta berikan metrik AI Score (0-100) untuk Viral, Hook, Retensi, dan Potensi Share.`;
            const scriptSchema = { type: "OBJECT", properties: { analisis: {type: "STRING"}, target_audiens: {type: "STRING"}, hook: {type: "STRING"}, script: {type: "STRING"}, cta: {type: "STRING"}, caption: {type: "STRING"}, hashtags: {type: "STRING"}, scores: { type: "OBJECT", properties: { viral: {type: "INTEGER"}, hook: {type: "INTEGER"}, retensi: {type: "INTEGER"}, share: {type: "INTEGER"} } } }, required: ["analisis", "target_audiens", "hook", "script", "cta", "caption", "hashtags", "scores"] };
            
            try {
                scriptsData[i] = await callAI(scriptPrompt, scriptSchema);
            } catch(e) {
                console.error(`Gagal generate script ke-${i+1}`, e);
            }
        }

        // 3. SIMPAN KE REDIS SEBAGAI JSON STATIS
        const timestamp = Date.now();
        const ttl = 86400; // Cache selama 24 Jam (86400 detik) untuk cadangan

        await fetch(UPSTASH_URL, {
            method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(["MSET", 
                "fbpro:static:trends", JSON.stringify({ data: trendData.trends, timestamp }),
                "fbpro:static:scripts", JSON.stringify({ data: scriptsData, timestamp }),
                "fbpro:stats:last_api_calls", apiCallsCount.toString()
            ])
        });
        
        // Set Expired key Redis (agar bersih jika tidak terupdate)
        await fetch(UPSTASH_URL, {
            method: "POST", headers: { "Authorization": `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(["EXPIRE", "fbpro:static:trends", ttl])
        });

        return res.status(200).json({ success: true, message: "Cache berhasil diperbarui secara background.", apiCalls: apiCallsCount });

    } catch (err) {
        console.error("Generator Error:", err);
        return res.status(500).json({ error: "Gagal memproses cron job." });
    }
}