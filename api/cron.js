// api/cron.js
module.exports = async function handler(req, res) {
    try {
        const baseUrl = `https://${req.headers.host}`;
        // Di-await agar Vercel tahu kita menunggu cache digenerate sampai tuntas.
        const response = await fetch(`${baseUrl}/api/cache-generator`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET || ''}` }
        });
        const data = await response.json();
        
        if (!response.ok) return res.status(500).json({ error: "Generator gagal", details: data });
        return res.status(200).json({ status: "Cron triggered and Cache generated successfully!", data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}