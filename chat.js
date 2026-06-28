/**
 * ==========================================
 * GPT-5 MINI Helper
 * Frontend
 * ==========================================
 */

const AI_MODEL = "openai/gpt-5-mini";
const API_ENDPOINT = "/api/openai/gpt-5-mini";

/**
 * Delay
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mengirim request ke GPT-5 Mini
 *
 * @param {Object} payload - Objek payload 
 * @returns {Object}
 */
async function askGPT(payload) {
    payload.model = AI_MODEL;
    
    const MAX_RETRY = 3;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
            const controller = new AbortController();

            const timeout = setTimeout(() => {
                controller.abort();
            }, 60000);

            const response = await fetch(API_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeout);

            const text = await response.text();

            if (!response.ok) {
                let message = text;
                try {
                    const json = JSON.parse(text);
                    message = json.error || message;
                } catch {}

                throw new Error(message);
            }

            return JSON.parse(text);
        } catch (err) {
            console.error(
                "GPT-5 Mini Error (Percobaan " +
                attempt +
                "/" +
                MAX_RETRY +
                "):",
                err
            );

            if (attempt >= MAX_RETRY) {
                throw err;
            }

            await sleep(1500);
        }
    }
}

/**
 * Kompatibilitas dengan index.html
 * Meneruskan instruksi fetch AI & memastikan `feature` dikirim
 * secara kondisional.
 */
async function fetchAI(prompt, schema, feature = null) {
    const enhancedPrompt = prompt + `\n\n[PENTING] Anda WAJIB merespons HANYA dengan format JSON murni yang valid tanpa teks pengantar, tanpa blok kode markdown (\`\`\`json). Struktur JSON wajib:\n${JSON.stringify(schema)}`;

    const payload = {
        contents: [{ parts: [{ text: enhancedPrompt }] }],
        systemInstruction: { parts: [{ text: "Anda adalah sistem GPT-5 Mini, konsultan strategi Facebook Pro paling cerdas di dunia. Analisis tren dan buat struktur konten dengan akurasi viral tinggi. Selalu merespons dalam bahasa Indonesia." }] }
    };

    // [PENTING] Hanya kirim property "feature" jika ada (misal: "trend").
    // Untuk fitur lain (Script, Analisis URL), `feature` ini tidak akan dikirim.
    if (feature) {
        payload.feature = feature;
    }

    const data = await askGPT(payload);
    
    let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    textResult = textResult.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
        const parsedJson = JSON.parse(textResult);
        return { data: parsedJson, sources: [] }; 
    } catch (e) {
        console.error("Gagal parsing JSON dari AI:", textResult);
        throw new Error("Format respons AI tidak valid. Server sibuk.");
    }
}

/**
 * Kompatibilitas untuk script lawas
 */
async function askGemini(payload, isHeavyTask = false) {
    return await askGPT(payload);
}