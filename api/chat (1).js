// Project Academy — Anthropic API Proxy
const https = require('https');

const FREE_LIMIT = 15;
const PRO_LIMIT  = 300;
const rateLimits = new Map();

function checkRateLimit(req, isPro) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const key = `${ip}:${new Date().toISOString().slice(0,10)}`;
  const limit = isPro ? PRO_LIMIT : FREE_LIMIT;
  const current = rateLimits.get(key) || 0;
  if (current >= limit) return false;
  rateLimits.set(key, current + 1);
  return true;
}

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { messages, system, max_tokens = 800, isPro = false } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' }); return;
  }

  if (!checkRateLimit(req, isPro)) {
    res.status(429).json({ error: isPro
      ? 'Daily AI limit reached. Resets at midnight.'
      : 'Free daily AI limit reached (15/day). Upgrade to Pro for unlimited.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'API not configured' }); return; }

  const bodyObj = { model: 'claude-sonnet-4-20250514', max_tokens, messages };
  if (system) bodyObj.system = system;
  const bodyStr = JSON.stringify(bodyObj);

  try {
    const result = await httpsPost({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, bodyStr);

    const data = JSON.parse(result.body);
    res.status(result.status).json(data);

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(502).json({ error: err.message });
  }
};
