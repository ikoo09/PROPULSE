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

// Membersihkan cache LocalStorage lama agar tidak terjadi QuotaExceededError
function cleanExpiredLocalCache() {
    const CACHE_TTL = 12 * 60 * 60 * 1000;
    const now = Date.now();
    let keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("fbpro_v1_")) {
            try {
                const item = JSON.parse(localStorage.getItem(key));
                if (now - item.timestamp >= CACHE_TTL) {
                    keysToRemove.push(key);
                }
            } catch(e) {
                keysToRemove.push(key); // Hapus jika data corrupt
            }
        }
    }
    
    keysToRemove.forEach(k => localStorage.removeItem(k));
    if (keysToRemove.length > 0) console.log(`🧹 Membersihkan ${keysToRemove.length} item cache LocalStorage yang expired.`);
}

// Fungsi membuat key cache stabil (bukan berdasarkan full prompt, melainkan cacheId/judul)
function generateCacheKey(feature, cacheId) {
    // Normalisasi karakter untuk key
    const safeId = cacheId ? cacheId.replace(/[^a-zA-Z0-9]/g, '_') : 'default';
    return `fbpro_v1_${feature}_${safeId}`;
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
 * Update: Ditambahkan cacheId stabil, Handler Quota LocalStorage, dan perubahan TTL script
 * @param {boolean} bypassCache Jika true, akan mengabaikan localStorage dan memaksa pembaruan ke server
 * @param {string} cacheId Identifier unik untuk cache yang stabil (misal: judul tren)
 */
async function fetchAI(prompt, schema, feature = null, bypassCache = false, cacheId = null) {
    
    // Coba bersihkan localStorage dulu untuk menjaga kuota
    cleanExpiredLocalCache();

    // 1. CEK LAYER 1: LOCAL STORAGE (Jika tidak di-bypass)
    const localCacheKey = generateCacheKey(feature, cacheId);
    const CACHE_TTL_12_HOURS = 12 * 60 * 60 * 1000;
    
    if (!bypassCache && (feature === "trend" || feature === "script")) {
        const cachedItem = localStorage.getItem(localCacheKey);
        
        if (cachedItem) {
            try {
                const parsedCache = JSON.parse(cachedItem);
                const timeElapsed = Date.now() - parsedCache.timestamp;
                
                // KEDUANYA (Trend & Script) kini kadaluwarsa setelah 12 Jam
                const isCacheValid = timeElapsed < CACHE_TTL_12_HOURS;
                
                if (isCacheValid) {
                    console.log(`⚡ Lapis 1 (LocalStorage) HIT: Mencegah request ke server -> ${localCacheKey}`);
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
    if (bypassCache) payload.bypassCache = true;
    if (cacheId) payload.cacheId = cacheId; // Teruskan cacheId ke backend untuk Key Redis yang stabil

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
            try {
                localStorage.setItem(localCacheKey, JSON.stringify({
                    timestamp: finalTimestamp,
                    data: parsedJson
                }));
                console.log(`💾 Tersimpan di Lapis 1 (LocalStorage) -> ${localCacheKey}`);
            } catch (storageError) {
                console.warn("⚠️ Quota LocalStorage Browser Penuh. Menjalankan pembersihan darurat...");
                // Pembersihan darurat agresif
                cleanExpiredLocalCache();
                try {
                    localStorage.setItem(localCacheKey, JSON.stringify({
                        timestamp: finalTimestamp,
                        data: parsedJson
                    }));
                } catch(e) {
                    console.error("❌ Gagal total menyimpan ke LocalStorage meskipun sudah dibersihkan.", e);
                }
            }
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