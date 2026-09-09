// Vercel serverless function: proxies the funnel stats API and keeps the
// access token server-side only (LESSON_STATS_TOKEN env var, never in code).
module.exports = async function handler(req, res) {
  var token = process.env.LESSON_STATS_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'LESSON_STATS_TOKEN is not configured on the server' });
    return;
  }

  try {
    var upstream = await fetch('https://frontend-flame-one-i4smhjdpsh.vercel.app/api/stats', {
      headers: { Authorization: 'Bearer ' + token }
    });
    var text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: 'upstream request failed' });
  }
};
