// api/gpt5mini.js
// Versi ini sudah dilucuti dari Trend & Script Generator.
// HANYA digunakan ketika user melakukan "Analisis URL".

module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Gunakan metode POST." });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY belum diatur." });

    try {
        const body = req.body || {};
        const model = body.model || "openai/gpt-5-mini";

        let input = "";
        if (body.contents && body.contents[0]?.parts?.[0]) input = body.contents[0].parts[0].text;
        
        let systemPrompt = "Kamu adalah pakar bedah konten Facebook Reels/Video Indonesia.";
        if (body.systemInstruction?.parts?.[0]) systemPrompt = body.systemInstruction.parts[0].text;

        // Panggil AI langsung tanpa Cache (Karena analisa URL butuh custom per user input)
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
        return res.status(500).json({ error: "Gagal memproses request Analisis.", details: err.message });
    }
}