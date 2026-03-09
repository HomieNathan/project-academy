// Project Academy — Cartesia TTS Proxy
// Converts text to speech using Cartesia's API
// Your CARTESIA_API_KEY lives in Vercel environment variables

// ── VOICE IDs ─────────────────────────────────────────────────────────────────
// Find voices at: https://play.cartesia.ai/voices
// Click any voice → copy the ID → paste below
const PERSONA_VOICES = {
  alex:   '87286a8d-7ea7-4235-a41a-dd9fa6630feb',
  rivera: 'f786b574-daa5-4673-aa0c-cbe3e8534c02',
  sage:   'a33f7a4c-100f-41cf-a1fd-5822e8fc253f',
  nova:   '47c38ca4-5f35-497b-b1a3-415245fb35e1',
};

const DEFAULT_VOICE = 'a0e99841-438c-4a64-b679-ae501e7d6091';
const CARTESIA_MODEL = 'sonic-english';
const CARTESIA_VERSION = '2024-06-10';

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); }
  catch { return errorResponse('Invalid JSON', 400, req); }

  const { text, persona = 'sage' } = body;

  if (!text || typeof text !== 'string') {
    return errorResponse('text is required', 400, req);
  }

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) return errorResponse('TTS not configured — missing CARTESIA_API_KEY', 503, req);

  console.log('Cartesia key present, length:', apiKey.length);
  console.log('Voice ID:', voiceId, 'Persona:', persona);

  const voiceId = PERSONA_VOICES[persona] || DEFAULT_VOICE;

  try {
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Cartesia-Version': CARTESIA_VERSION,
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL,
        transcript: text,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'mp3',
          encoding: 'mp3',
          sample_rate: 44100,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      console.log('Cartesia error status:', response.status, 'body:', errText);
      return errorResponse(`Cartesia error ${response.status}: ${errText}`, response.status, req);
    }

    const audioBuffer = await response.arrayBuffer();
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
        ...corsHeaders(req),
      },
    });

  } catch (err) {
    return errorResponse('Failed to reach TTS service', 502, req);
  }
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function errorResponse(message, status, req) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

