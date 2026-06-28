/**
 * ==========================================
 * GPT-5 MINI Helper
 * Frontend with LocalStorage Caching (Layer 1)
 * ==========================================
 */

const AI_MODEL = "openai/gpt-5-mini";
const API_ENDPOINT = "/api/gpt5mini";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi Hash sederhana untuk membuat key unik di LocalStorage
function generateHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return "cache_layer1_" + hash;
}

async function askGPT(payload) {
    payload.model = AI_MODEL;
    const MAX_RETRY = 3;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);

            const response = await fetch(API_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
            console.error(`GPT-5 Mini Error (Percobaan ${attempt}/${MAX_RETRY}):`, err);
            if (attempt >= MAX_RETRY) throw err;
            await sleep(1500);
        }
    }
}

/**
 * Update: Ditambahkan sistem Caching Lapis 1 (LocalStorage)
 * @param {boolean} bypassCache Jika true, akan mengabaikan localStorage dan memaksa pembaruan ke server
 */
async function fetchAI(prompt, schema, feature = null, bypassCache = false) {
    
    // 1. CEK LAYER 1: LOCAL STORAGE (Jika tidak di-bypass)
    const localCacheKey = generateHash(prompt + (feature || ""));
    const CACHE_TTL_12_HOURS = 12 * 60 * 60 * 1000;
    
    if (!bypassCache && (feature === "trend" || feature === "script")) {
        const cachedItem = localStorage.getItem(localCacheKey);
        
        if (cachedItem) {
            try {
                const parsedCache = JSON.parse(cachedItem);
                const timeElapsed = Date.now() - parsedCache.timestamp;
                
                // Script dianggap permanen, Trend kedaluwarsa setelah 12 jam
                const isCacheValid = feature === "script" ? true : timeElapsed < CACHE_TTL_12_HOURS;
                
                if (isCacheValid) {
                    console.log(`⚡ Lapis 1 (LocalStorage) HIT: Mencegah request ke server.`);
                    return { 
                        data: parsedCache.data, 
                        sources: [], 
                        metadata: { source: 'local', timestamp: parsedCache.timestamp } 
                    };
                } else {
                    console.log(`⏰ Lapis 1 Expired. Mengambil data baru...`);
                }
            } catch (e) {
                console.error("Gagal membaca LocalStorage Cache", e);
            }
        }
    }

    // 2. JIKA LAYER 1 KOSONG / EXPIRED / BYPASS -> LANJUT KE SERVER (API)
    const enhancedPrompt = prompt + `\n\n[PENTING] Anda WAJIB merespons HANYA dengan format JSON murni yang valid tanpa teks pengantar, tanpa blok kode markdown (\`\`\`json). Struktur JSON wajib:\n${JSON.stringify(schema)}`;

    const payload = {
        contents: [{ parts: [{ text: enhancedPrompt }] }],
        systemInstruction: { parts: [{ text: "Anda adalah sistem GPT-5 Mini, konsultan strategi Facebook Pro paling cerdas di dunia. Analisis tren dan buat struktur konten dengan akurasi viral tinggi. Selalu merespons dalam bahasa Indonesia." }] }
    };

    if (feature) payload.feature = feature;
    if (bypassCache) payload.bypassCache = true; // Kirim sinyal bypass ke backend (untuk bypass Redis)

    const data = await askGPT(payload);
    
    let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    textResult = textResult.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
        const parsedJson = JSON.parse(textResult);
        
        // Tentukan sumber data untuk UI (Redis vs AI)
        const dataSource = data.metadata?.cached ? 'redis' : 'ai';
        const finalTimestamp = data.metadata?.timestamp || Date.now();

        const resultToReturn = { 
            data: parsedJson, 
            sources: [], 
            metadata: { source: dataSource, timestamp: finalTimestamp } 
        };

        // 3. SIMPAN KE LAYER 1 (LOCAL STORAGE)
        if (feature === "trend" || feature === "script") {
            localStorage.setItem(localCacheKey, JSON.stringify({
                timestamp: finalTimestamp,
                data: parsedJson
            }));
            console.log(`💾 Tersimpan di Lapis 1 (LocalStorage)`);
        }

        return resultToReturn;

    } catch (e) {
        console.error("Gagal parsing JSON dari AI:", textResult);
        throw new Error("Format respons AI tidak valid. Server sibuk.");
    }
}

// ----------------------------------------------------
// AUTO RUN: Memanggil data tren saat halaman dimuat
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof triggerNicheCrawling === 'function') {
            triggerNicheCrawling();
        }
    }, 200);
});