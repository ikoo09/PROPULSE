// api/cron.js
// Endpoint ini yang dipanggil langsung oleh Vercel secara otomatis sesuai jadwal di vercel.json

module.exports = async function handler(req, res) {
    try {
        // Kita meneruskan request ke API generator
        // Menggunakan fetch tanpa 'await' karena proses AI generate bisa > 10 detik (hindari Timeout limit cron vercel)
        const baseUrl = `https://${req.headers.host}`;
        
        fetch(`${baseUrl}/api/cache-generator`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`
            }
        }).catch(e => console.error("Cron fetch error (Background):", e));

        return res.status(200).json({ status: "Cron triggered successfully. AI is generating content in the background." });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}