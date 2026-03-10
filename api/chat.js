// Project Academy — Anthropic API Proxy

const FREE_LIMIT_PER_DAY = 15;
const PRO_LIMIT_PER_DAY  = 300;
const rateLimits = new Map();

function getRateLimitKey(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const today = new Date().toISOString().slice(0, 10);
  return `${ip}:${today}`;
}

function checkRateLimit(key, isPro) {
  const limit = isPro ? PRO_LIMIT_PER_DAY : FREE_LIMIT_PER_DAY;
  const current = rateLimits.get(key) || 0;
  if (current >= limit) return false;
  rateLimits.set(key, current + 1);
  if (rateLimits.size > 10000) {
    const keys = [...rateLimits.keys()];
    keys.slice(0, 5000).forEach(k => rateLimits.delete(k));
  }
  return true;
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

  const rlKey = getRateLimitKey(req);
  if (!checkRateLimit(rlKey, isPro)) {
    const msg = isPro
      ? 'Daily AI limit reached. Resets at midnight.'
      : 'Free daily AI limit reached (15/day). Upgrade to Pro for unlimited access.';
    res.status(429).json({ error: msg }); return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'API not configured' }); return; }

  try {
    const body = { model: 'claude-sonnet-4-20250514', max_tokens, messages };
    if (system) body.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data?.error?.message || 'Anthropic API error' });
      return;
    }
    res.status(200).json(data);

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(502).json({ error: err.message });
  }
};
