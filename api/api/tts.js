// Project Academy — Cartesia TTS Proxy
const https = require('https');

const PERSONA_VOICES = {
  alex:   '87286a8d-7ea7-4235-a41a-dd9fa6630feb',
  rivera: 'f786b574-daa5-4673-aa0c-cbe3e8534c02',
  sage:   'a33f7a4c-100f-41cf-a1fd-5822e8fc253f',
  nova:   '47c38ca4-5f35-497b-b1a3-415245fb35e1',
};

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
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

  const { text, persona = 'sage' } = req.body || {};
  if (!text) { res.status(400).json({ error: 'text is required' }); return; }

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'CARTESIA_API_KEY not set' }); return; }

  const voiceId = PERSONA_VOICES[persona] || PERSONA_VOICES.sage;
  const bodyStr = JSON.stringify({
    model_id: 'sonic-english',
    transcript: text,
    voice: { mode: 'id', id: voiceId },
    output_format: { container: 'mp3', encoding: 'mp3', sample_rate: 44100 },
  });

  try {
    const result = await httpsPost({
      hostname: 'api.cartesia.ai',
      path: '/tts/bytes',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Cartesia-Version': '2024-06-10',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, bodyStr);

    if (result.status !== 200) {
      console.error('Cartesia error:', result.status, result.body.toString());
      res.status(result.status).json({ error: result.body.toString() });
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(result.body);

  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(502).json({ error: err.message });
  }
};
