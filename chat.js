/**
 * ==========================================
 * Frontend PRO - STATIC CACHE DRIVEN
 * Super Cepat, AI Hit = 0 (Kecuali URL Analisis)
 * ==========================================
 */

const API_STATIC_ENDPOINT = "/api/trends";
const API_AI_ENDPOINT = "/api/gpt5mini";

let appState = {
    trends: [],
    scripts: {},
    selectedTrendIdx: null
};

// =======================================
// 1. LOAD DATA STATIS (TANPA AI)
// =======================================
async function loadCachedTrend() {
    document.getElementById('crawling-status').classList.remove('hidden');
    document.getElementById('trends-feed').innerHTML = ''; // Clear feed
    
    try {
        const res = await fetch(API_STATIC_ENDPOINT);
        const data = await res.json();
        
        if (data.status === "empty") {
            showToast("Data sedang disiapkan oleh sistem.", "info");
            document.getElementById('trends-feed').innerHTML = `<p class="text-slate-500 text-center py-5"><i class="fa-solid fa-clock mb-2 text-2xl block"></i>Cron Job belum berjalan.<br>Harap tunggu jadwal otomatis.</p>`;
            return;
        }

        appState.trends = data.trends || [];
        appState.scripts = data.scripts || {};

        renderTrends(appState.trends);
        updateDashboardStats(data.metadata);

    } catch (e) {
        console.error("Gagal load data statis:", e);
        showToast("Gagal mengambil data dari Edge Server.", "error");
        document.getElementById('trends-feed').innerHTML = `<p class="text-red-400 text-center py-5">Koneksi ke Edge Server gagal.</p>`;
    } finally {
        document.getElementById('crawling-status').classList.add('hidden');
    }
}

function renderTrends(trends) {
    const feed = document.getElementById('trends-feed');
    feed.innerHTML = trends.map((t, idx) => `
        <div onclick="selectTrend(${idx})" class="group p-4 bg-slate-900/50 hover:bg-slate-800 border border-white/5 hover:border-cyan-500/50 rounded-2xl cursor-pointer transition-all relative overflow-hidden">
            <div class="absolute right-0 top-0 h-full w-1 bg-cyan-500 opacity-0 group-hover:opacity-100 transition-all"></div>
            <div class="flex items-center justify-between mb-2">
                <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">${t.kategori}</span>
                <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/10 text-cyan-400">🔥 VIRAL</span>
            </div>
            <h3 class="font-extrabold text-sm sm:text-base text-white group-hover:text-cyan-300 transition-colors">${t.title}</h3>
            <p class="text-[11px] sm:text-xs text-slate-400 mt-2 line-clamp-2">${t.desc}</p>
        </div>
    `).join('');
}

function updateDashboardStats(meta) {
    const updateTime = new Date(meta.timestamp);
    const nextTime = new Date(meta.timestamp + (12 * 60 * 60 * 1000)); // Siklus Cron 12 Jam
    
    const formatTime = (d) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} WIB`;
    
    document.getElementById('stat-source').innerHTML = `<i class="fa-solid fa-bolt text-yellow-400"></i> Upstash Redis`;
    document.getElementById('stat-update').innerHTML = `<i class="fa-regular fa-clock"></i> Gen: ${formatTime(updateTime)}`;
    document.getElementById('stat-expire').innerHTML = `<i class="fa-solid fa-arrows-rotate text-cyan-400"></i> Next: ${formatTime(nextTime)}`;
    
    document.getElementById('stat-api').innerHTML = `<i class="fa-solid fa-microchip"></i> API Calls Hari Ini: ${meta.apiCallsToday}`;
    document.getElementById('stat-hit').innerHTML = `Server Hits (Global): ${meta.redisHits} User`;
}

// =======================================
// 2. TAMPILKAN SCRIPT INSTAN
// =======================================
function selectTrend(idx) {
    appState.selectedTrendIdx = idx;
    const trend = appState.trends[idx];
    const d = appState.scripts[idx]; 
    
    document.getElementById('scripts-container').classList.remove('hidden');
    if(window.innerWidth < 1024) setTimeout(() => document.getElementById('scripts-container').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    
    if (!d) {
        document.getElementById('script-content-area').innerHTML = `<p class="text-red-400 text-xs text-center py-5">Sistem gagal menyimpan pre-generate script untuk trend ini.</p>`;
        return;
    }

    document.getElementById('script-timestamp').innerText = "Loaded in 0ms (Redis Pre-Generated) ⚡";
    showToast("Script dimuat instan! 🚀", "success");

    document.getElementById('ai-scores-container').innerHTML = [
        {k: 'Viral Score', v: d.scores?.viral || 90, c: 'text-rose-400', bg:'bg-rose-500'}, 
        {k: 'Kekuatan Hook', v: d.scores?.hook || 85, c: 'text-fuchsia-400', bg:'bg-fuchsia-500'},
        {k: 'Retensi', v: d.scores?.retensi || 80, c: 'text-cyan-400', bg:'bg-cyan-500'}, 
        {k: 'Potensi Share', v: d.scores?.share || 88, c: 'text-emerald-400', bg:'bg-emerald-500'}
    ].map(s => `
        <div class="bg-slate-900/60 p-2 sm:p-3 rounded-xl border border-white/5 flex flex-col justify-center">
            <span class="text-[8px] sm:text-[9px] uppercase font-bold text-slate-400 block">${s.k}</span>
            <div class="flex items-center justify-between mt-1"><span class="text-sm sm:text-lg font-black ${s.c}">${s.v}/100</span></div>
            <div class="w-full bg-slate-950 rounded-full h-1 mt-1"><div class="h-1 rounded-full ${s.bg}" style="width: ${s.v}%"></div></div>
        </div>
    `).join('');

    const renderSec = (title, content, icon, color) => `
        <div class="space-y-2 bg-slate-900/30 p-3 sm:p-4 rounded-xl border border-white/5 group">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <span class="text-[10px] sm:text-xs uppercase font-black ${color} flex items-center gap-1.5"><i class="fa-solid ${icon}"></i> ${title}</span>
                <button onclick="copyTextDirectly(\`${(content||'').replace(/`/g, "\\`")}\`, this)" class="w-fit text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded-md text-slate-300 transition-all flex items-center gap-1 border border-white/5"><i class="fa-solid fa-copy"></i> Copy</button>
            </div>
            <div class="font-mono text-[11px] sm:text-xs whitespace-pre-line leading-relaxed text-slate-300">${content}</div>
        </div>
    `;

    document.getElementById('script-content-area').innerHTML = `
        ${renderSec('Analisis & Target Audiens', `Analisis: ${d.analisis}\n\nTarget Audiens: ${d.target_audiens}`, 'fa-magnifying-glass-chart', 'text-blue-400')}
        ${renderSec('Hook Utama (3 Detik)', d.hook, 'fa-bolt', 'text-rose-400')}
        ${renderSec('Naskah & Visual Lengkap', d.script, 'fa-video', 'text-emerald-400')}
        ${renderSec('Call to Action (CTA)', d.cta, 'fa-bullhorn', 'text-fuchsia-400')}
        ${renderSec('Caption & SEO Hashtags', `${d.caption}\n\n${d.hashtags}`, 'fa-hashtag', 'text-cyan-400')}
    `;
}

// =======================================
// 3. ANALISIS URL (AI ON-DEMAND)
// =======================================
async function fetchURLAnalysis(prompt, schema) {
    const payload = {
        contents: [{ parts: [{ text: prompt + `\n\nWAJIB HANYA JSON:\n${JSON.stringify(schema)}` }] }],
        systemInstruction: { parts: [{ text: "Jawab dalam JSON." }] }
    };

    const res = await fetch(API_AI_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    
    if(!res.ok) throw new Error("Gagal menyambung ke server AI");
    
    const text = await res.text();
    const data = JSON.parse(text);
    
    let raw = data.candidates[0].content.parts[0].text;
    raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return { data: JSON.parse(raw) };
}

// Auto Load Saat Halaman Buka
document.addEventListener('DOMContentLoaded', () => {
    loadCachedTrend();
});