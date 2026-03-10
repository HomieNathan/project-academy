// Project Academy — Cartesia TTS Proxy (serialized queue)
const https = require('https');

const VOICE_ID = 'f786b574-daa5-4673-aa0c-cbe3e8534c02'; // Moriah

// Server-side queue — only 1 request to Cartesia at a time
let _queue = Promise.resolve();

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function cartesiaRequest(text, apiKey) {
  const bodyStr = JSON.stringify({
    model_id: 'sonic-english',
    transcript: text,
    voice: { mode: 'id', id: VOICE_ID },
    output_format: { container: 'mp3', encoding: 'mp3', sample_rate: 44100 },
    speed: -0.15,
  });
  return httpsPost({
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
}

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { text } = req.body || {};
  if (!text) { res.status(400).json({ error: 'text is required' }); return; }

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'CARTESIA_API_KEY not set' }); return; }

  // Chain onto the queue so requests run one at a time
  _queue = _queue.then(async () => {
    try {
      const result = await cartesiaRequest(text, apiKey);
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
  });
};
