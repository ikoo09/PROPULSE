/**
 * Frontend PRO - STATIC CACHE DRIVEN + ORIGINAL DESIGN
 */

let state = { trends: [], scripts: {}, selectedTrend: null, scriptData: null };
let isFetchingTrend = false;

function startProgressAnim(elementId, steps) {
    const el = document.getElementById(elementId);
    if(!el) return null;
    let i = 0; el.innerText = steps[0];
    return setInterval(() => { i = (i + 1) % steps.length; el.innerText = steps[i]; }, 1000); 
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    let icon = type === 'error' ? '<i class="fa-solid fa-xmark text-red-400"></i>' : (type === 'info' ? '<i class="fa-solid fa-info text-cyan-400"></i>' : '<i class="fa-solid fa-check text-emerald-400"></i>');
    let bg = type === 'error' ? 'bg-red-500/15 border-red-500/30 text-red-200' : (type === 'info' ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-200' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200');
    
    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-500 transform translate-y-10 opacity-0 border backdrop-blur-md ${bg}`;
    toast.innerHTML = `${icon}<p class="text-xs font-medium">${message}</p>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
    setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 500); }, 3500);
}

async function copyTextDirectly(text, btnElement = null) {
    try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
        else { const temp = document.createElement('textarea'); temp.value = text; document.body.appendChild(temp); temp.select(); document.execCommand('copy'); document.body.removeChild(temp); }
        if(btnElement) { const original = btnElement.innerHTML; btnElement.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> Disalin'; setTimeout(() => btnElement.innerHTML = original, 2000); }
        else showToast('Berhasil disalin!', 'success');
    } catch (err) { showToast('Gagal menyalin.', 'error'); }
}

function copyFullScript() {
    if(!state.scriptData) return;
    const text = `Judul: ${state.selectedTrend.title}\n\n=== ANALISIS & AUDIENS ===\n${state.scriptData.analisis}\nTarget Audiens: ${state.scriptData.target_audiens}\n\n=== HOOK ===\n${state.scriptData.hook}\n\n=== SCRIPT ===\n${state.scriptData.script}\n\n=== CTA ===\n${state.scriptData.cta}\n\n=== CAPTION ===\n${state.scriptData.caption}\n\n=== HASHTAG ===\n${state.scriptData.hashtags}`;
    copyTextDirectly(text, document.getElementById('btn-copy-script'));
}

async function triggerNicheCrawling() {
    if (isFetchingTrend) return;
    isFetchingTrend = true;

    document.getElementById('crawling-status').classList.remove('hidden');
    const anim = startProgressAnim('crawling-text', ["🔍 Menyambung ke Edge Network...", "⚡ Memuat data statis super cepat..."]);
    
    try {
        const res = await fetch('/api/trends');
        const data = await res.json();

        if (res.status === 500 || data.error) throw new Error(data.error || "Edge Server Error");

        if (data.status === "empty") {
            showToast("Server belum men-generate data. Harap jalankan Cron Job.", "info");
            document.getElementById('trends-feed').innerHTML = `<div class="text-center py-10 bg-slate-900/40 rounded-2xl border border-white/5"><p class="text-sm text-yellow-400"><i class="fa-solid fa-triangle-exclamation text-3xl mb-3 block"></i>Data belum tersedia.<br>Picu /api/cron di browser Anda untuk pertama kali (Buka tab baru: namaweb.vercel.app/api/cron).</p></div>`;
            return;
        }

        state.trends = data.trends || [];
        state.scripts = data.scripts || {};
        
        const updateTime = new Date(data.metadata.timestamp);
        const nextTime = new Date(data.metadata.timestamp + (12 * 60 * 60 * 1000));
        const formatTime = (d) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} WIB`;
        
        document.getElementById('cache-source').innerHTML = `<i class="fa-solid fa-server"></i> Sumber: Upstash Redis`;
        document.getElementById('last-update-time').innerHTML = `<i class="fa-regular fa-clock"></i> Update: ${formatTime(updateTime)}`;

        if (window.trendCountdownInterval) clearInterval(window.trendCountdownInterval);
        const updateLiveCountdown = () => {
            const now = Date.now();
            const timeDifference = nextTime.getTime() - now;
            if (timeDifference <= 0) {
                clearInterval(window.trendCountdownInterval);
                document.getElementById('next-update-time').innerHTML = `<i class="fa-solid fa-rotate animate-spin text-cyan-400"></i> Update Otomatis via Cron...`;
                return;
            }
            const hrs = Math.floor(timeDifference / (1000 * 60 * 60));
            const mins = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
            const formatDigit = (num) => num.toString().padStart(2, '0');
            document.getElementById('next-update-time').innerHTML = `<i class="fa-solid fa-hourglass-end text-cyan-400"></i> Expired: ${formatTime(nextTime)} <span class="ml-1 px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded text-[9px] font-mono font-bold tracking-wider">${formatDigit(hrs)}:${formatDigit(mins)}</span>`;
        };
        updateLiveCountdown();
        window.trendCountdownInterval = setInterval(updateLiveCountdown, 60000);

        document.getElementById('trends-feed').innerHTML = state.trends.map((t, idx) => `
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

        showToast("Redis HIT: Data termuat sangat cepat! 🚀", "info");

    } catch(e) {
        showToast("Koneksi ke Edge Server gagal.", "error");
        document.getElementById('trends-feed').innerHTML = `<div class="text-center py-10 text-red-500 bg-red-900/10 rounded-2xl border border-red-500/20"><i class="fa-solid fa-triangle-exclamation text-3xl mb-3 block"></i><p class="text-xs font-medium">Gagal membaca Redis. Pastikan Variabel Lingkungan sudah disetel dan Cron sudah dijalankan.</p></div>`;
    } finally {
        clearInterval(anim);
        document.getElementById('crawling-status').classList.add('hidden');
        isFetchingTrend = false;
    }
}

function selectTrend(idx) {
    state.selectedTrend = state.trends[idx];
    state.scriptData = state.scripts[idx];
    const d = state.scriptData;
    
    document.getElementById('scripts-container').classList.remove('hidden');
    if(window.innerWidth < 1024) setTimeout(() => document.getElementById('scripts-container').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    
    if(!d) {
        document.getElementById('script-content-area').innerHTML = `<p class="text-red-400 text-xs text-center py-5">Script untuk trend ini gagal digenerate oleh AI saat proses sinkronisasi latar belakang.</p>`;
        return;
    }

    document.getElementById('script-content-area').innerHTML = `<div class="py-12 flex flex-col items-center"><div class="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div><p class="text-xs text-emerald-400 mt-3" id="script-anim-text">Membuka Edge Cache...</p></div>`;
    document.getElementById('ai-scores-container').innerHTML = '';
    
    setTimeout(() => {
        document.getElementById('script-timestamp').innerText = "Load Speed: 0ms (Redis Pre-Generated) ⚡";
        showToast("Redis HIT: Script dimuat dari Server! 🚀", "info");
        
        const safeScore = (val, defaultVal) => val ? val : defaultVal;
        
        document.getElementById('ai-scores-container').innerHTML = [
            {k: 'Viral Score', v: safeScore(d.scores?.viral, 85), c: 'text-rose-400', bg:'bg-rose-500'}, 
            {k: 'Kekuatan Hook', v: safeScore(d.scores?.hook, 90), c: 'text-fuchsia-400', bg:'bg-fuchsia-500'},
            {k: 'Retensi', v: safeScore(d.scores?.retensi, 82), c: 'text-cyan-400', bg:'bg-cyan-500'}, 
            {k: 'Potensi Share', v: safeScore(d.scores?.share, 88), c: 'text-emerald-400', bg:'bg-emerald-500'}
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
                <div class="font-mono text-[11px] sm:text-xs whitespace-pre-line leading-relaxed text-slate-300">${content || 'Data tidak tersedia'}</div>
            </div>
        `;

        document.getElementById('script-content-area').innerHTML = `
            ${renderSec('Analisis & Target Audiens', `Analisis: ${d.analisis}\n\nTarget Audiens: ${d.target_audiens}`, 'fa-magnifying-glass-chart', 'text-blue-400')}
            ${renderSec('Hook Utama (3 Detik)', d.hook, 'fa-bolt', 'text-rose-400')}
            ${renderSec('Naskah & Visual Lengkap', d.script, 'fa-video', 'text-emerald-400')}
            ${renderSec('Call to Action (CTA)', d.cta, 'fa-bullhorn', 'text-fuchsia-400')}
            ${renderSec('Caption & SEO Hashtags', `${d.caption}\n\n${d.hashtags}`, 'fa-hashtag', 'text-cyan-400')}
        `;
        saveToHistory('Script', state.selectedTrend.title, d);
    }, 600); 
}

async function handleURLAnalysis() {
    const url = document.getElementById('fb-url-input').value;
    if(!url) return showToast("Masukkan link URL Facebook!", "error");
    
    document.getElementById('url-result-area').classList.add('hidden');
    document.getElementById('url-loading').classList.remove('hidden');
    const anim = startProgressAnim('url-loading-text', ["🔄 Memeriksa konteks URL...", "🎥 Menganalisis...", "💡 Merumuskan saran..."]);
    
    const prompt = `Simulasikan analisis pakar untuk video/ide dari link ini: ${url}. Berikan evaluasi yang mendalam dan tajam.
    Format JSON: 1. Kelebihan (Array string), 2. Kekurangan (Array string), 3. Hook, 4. CTA, 5. Saran perbaikan.`;
    const schema = { type: "OBJECT", properties: { kelebihan: {type:"ARRAY", items:{type:"STRING"}}, kekurangan: {type:"ARRAY", items:{type:"STRING"}}, hook: {type:"STRING"}, cta: {type:"STRING"}, saran: {type:"STRING"} }, required:["kelebihan","kekurangan","hook","cta","saran"] };
    
    try {
        const payload = {
            contents: [{ parts: [{ text: prompt + `\n\nWAJIB HANYA JSON:\n${JSON.stringify(schema)}` }] }],
            systemInstruction: { parts: [{ text: "Jawab dalam JSON." }] }
        };

        const res = await fetch('/api/gpt5mini', { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const dataJson = await res.json();
        
        if (dataJson.error) throw new Error(dataJson.error);
        
        let raw = dataJson.candidates[0].content.parts[0].text;
        raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        const d = JSON.parse(raw);

        document.getElementById('url-result-area').innerHTML = `
            <div class="space-y-4">
                <div class="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl relative group">
                    <button onclick="copyTextDirectly(\`${d.kelebihan.join('\\n')}\`, this)" class="absolute top-3 right-3 text-[10px] px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded border opacity-0 group-hover:opacity-100"><i class="fa-solid fa-copy"></i> Copy</button>
                    <span class="text-[11px] font-bold text-emerald-400 block mb-2"><i class="fa-solid fa-plus-circle"></i> Kelebihan Konten</span>
                    <ul class="text-xs text-emerald-100 space-y-1.5 list-disc pl-4">${d.kelebihan.map(k=>`<li>${k}</li>`).join('')}</ul>
                </div>
                <div class="bg-red-500/10 border border-red-500/20 p-4 rounded-xl relative group">
                    <button onclick="copyTextDirectly(\`${d.kekurangan.join('\\n')}\`, this)" class="absolute top-3 right-3 text-[10px] px-2 py-1 bg-red-500/20 text-red-300 rounded border opacity-0 group-hover:opacity-100"><i class="fa-solid fa-copy"></i> Copy</button>
                    <span class="text-[11px] font-bold text-red-400 block mb-2"><i class="fa-solid fa-minus-circle"></i> Kekurangan (Drop Factor)</span>
                    <ul class="text-xs text-red-100 space-y-1.5 list-disc pl-4">${d.kekurangan.map(k=>`<li>${k}</li>`).join('')}</ul>
                </div>
            </div>
            <div class="space-y-4">
                <div class="bg-slate-900/60 border border-white/5 p-4 rounded-xl relative group">
                    <button onclick="copyTextDirectly(\`Hook: ${d.hook}\\nCTA: ${d.cta}\`, this)" class="absolute top-3 right-3 text-[10px] px-2 py-1 bg-white/5 text-slate-300 rounded border opacity-0 group-hover:opacity-100"><i class="fa-solid fa-copy"></i> Copy</button>
                    <span class="text-[11px] font-bold text-cyan-400 block mb-1">Rekomendasi Hook Baru</span>
                    <p class="text-xs text-slate-300 italic mb-4">"${d.hook}"</p>
                    <span class="text-[11px] font-bold text-fuchsia-400 block mb-1">Rekomendasi CTA</span>
                    <p class="text-xs text-slate-300 italic">"${d.cta}"</p>
                </div>
                <div class="bg-slate-900/60 border border-white/5 p-4 rounded-xl relative group">
                    <button onclick="copyTextDirectly(\`${d.saran}\`, this)" class="absolute top-3 right-3 text-[10px] px-2 py-1 bg-white/5 text-slate-300 rounded border opacity-0 group-hover:opacity-100"><i class="fa-solid fa-copy"></i> Copy</button>
                    <span class="text-[11px] font-bold text-blue-400 block mb-1">Saran Perbaikan</span>
                    <p class="text-xs text-slate-300 leading-relaxed">${d.saran}</p>
                </div>
            </div>
        `;
        document.getElementById('url-result-area').classList.remove('hidden');
        saveToHistory('Analisis URL', url, d);
    } catch(e) {
        showToast("Analisis gagal: " + e.message, "error");
    } finally { clearInterval(anim); document.getElementById('url-loading').classList.add('hidden'); }
}

async function saveToHistory(type, title, data) {
    let dataToSave = type === 'Script' ? { analisis: data.analisis, hook: data.hook, scores: data.scores } : data;
    const item = { type, title, data: dataToSave, date: new Date().toLocaleString('id-ID') };
    try { await fetch('/api/gpt5mini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'history_save', item }) }); } catch(e) {}
}

async function clearHistory() {
    if(!confirm("Yakin menghapus semua riwayat global?")) return;
    document.getElementById('history-container').innerHTML = '<p class="text-slate-500 text-sm py-5">Menghapus riwayat...</p>';
    try {
        await fetch('/api/gpt5mini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'history_clear' }) });
        renderHistory();
        showToast("Riwayat dibersihkan.");
    } catch(e) {}
}

async function renderHistory() {
    const container = document.getElementById('history-container');
    container.innerHTML = '<div class="col-span-1 md:col-span-3 text-center py-10"><i class="fa-solid fa-spinner animate-spin text-2xl text-cyan-500"></i><p class="text-xs mt-2 text-slate-400">Memuat riwayat...</p></div>';
    try {
        const res = await fetch('/api/gpt5mini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'history_get' }) });
        const data = await res.json();
        const history = data.history || [];
        
        if(history.length === 0) {
            container.innerHTML = `<div class="col-span-1 md:col-span-2 lg:col-span-3 text-center py-12 text-slate-500"><i class="fa-solid fa-folder-open text-4xl mb-3 block opacity-50"></i><p class="text-sm font-medium">Belum ada riwayat tersimpan secara global.</p></div>`;
            return;
        }

        container.innerHTML = history.map(item => `
            <div class="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-white/5 flex flex-col justify-between group hover:border-cyan-500/30 transition-all">
                <div>
                    <div class="flex justify-between items-start mb-3">
                        <span class="px-2 py-1 rounded-md text-[9px] font-bold ${item.type === 'Script' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'} uppercase border border-white/5">${item.type}</span>
                        <span class="text-[9px] text-slate-500 flex flex-col items-end"><i class="fa-regular fa-calendar text-[10px] mb-0.5"></i> ${item.date.split(',')[0]}</span>
                    </div>
                    <h4 class="font-bold text-sm text-slate-200 line-clamp-2 leading-snug">${item.title}</h4>
                </div>
                <div class="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
                    <button onclick='copyTextDirectly(${JSON.stringify(JSON.stringify(item.data, null, 2)).replace(/'/g, "&#39;")}, this)' class="w-full text-[10px] px-3 py-2 bg-white/5 text-slate-300 rounded-lg hover:bg-white/10 transition-all border border-white/5 flex items-center justify-center gap-1.5"><i class="fa-solid fa-copy"></i> Salin Raw JSON</button>
                </div>
            </div>
        `).join('');
    } catch(e) {
        container.innerHTML = '<div class="col-span-1 md:col-span-3 text-center text-red-400 py-10"><p class="text-sm font-medium">Gagal mengambil riwayat.</p></div>';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    switchView('trends');
    setTimeout(() => { triggerNicheCrawling(); }, 200);
});