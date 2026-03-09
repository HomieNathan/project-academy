// Project Academy — Anthropic API Proxy
// Your ANTHROPIC_API_KEY lives in Vercel environment variables — never sent to the browser.



const ALLOWED_ORIGINS = [
  'https://project-academy.vercel.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

// Rate limiting: simple in-memory store (resets per edge instance)
// For production scale, swap with Upstash Redis
const rateLimits = new Map();
const FREE_LIMIT_PER_DAY  = 15;   // free tier: 15 AI requests/day
const PRO_LIMIT_PER_DAY   = 300;  // pro tier: effectively unlimited

function getRateLimitKey(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           || req.headers.get('x-real-ip')
           || 'unknown';
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${ip}:${today}`;
}

function checkRateLimit(key, isPro) {
  const limit = isPro ? PRO_LIMIT_PER_DAY : FREE_LIMIT_PER_DAY;
  const current = rateLimits.get(key) || 0;
  if (current >= limit) return false;
  rateLimits.set(key, current + 1);
  // Clean up old keys periodically
  if (rateLimits.size > 10000) {
    const keys = [...rateLimits.keys()];
    keys.slice(0, 5000).forEach(k => rateLimits.delete(k));
  }
  return true;
}

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse body
  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON', 400, req);
  }

  const { messages, system, max_tokens = 800, isPro = false } = body;

  if (!messages || !Array.isArray(messages)) {
    return errorResponse('messages array required', 400, req);
  }

  // Rate limit check
  const rlKey = getRateLimitKey(req);
  if (!checkRateLimit(rlKey, isPro)) {
    const msg = isPro
      ? 'Daily AI limit reached. Resets at midnight.'
      : 'Free daily AI limit reached (15/day). Upgrade to Pro for unlimited access.';
    return errorResponse(msg, 429, req);
  }

  // Call Anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse('API not configured', 503, req);
  }

  try {
    const anthropicBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      messages,
    };
    if (system) anthropicBody.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return errorResponse(data?.error?.message || 'Anthropic API error', response.status, req);
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(req),
      },
    });

  } catch (err) {
    return errorResponse('Failed to reach AI service', 502, req);
  }
}

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function errorResponse(message, status, req) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(req),
    },
  });
}
