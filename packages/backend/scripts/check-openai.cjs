/**
 * One-off ops diagnostic: verify the configured AI provider actually answers a
 * chat completion from inside the backend container (reachability + key + model
 * + billing). Run it against the running container:
 *
 *   docker compose -f docker/docker-compose.host.yml exec -T backend \
 *     node < packages/backend/scripts/check-openai.cjs
 *
 * Reads AI_API_KEY / AI_MODEL / AI_BASE_URL from the container env. Prints the
 * HTTP status and a body snippet — it never prints the key. CommonJS + no
 * top-level await so it runs when piped to `node` via stdin.
 */
const key = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
const model = process.env.AI_MODEL || 'gpt-4.1-mini';
const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

if (!key) {
  console.log('AI_API_KEY is empty in the container env');
  process.exit(1);
}

console.log('STREAM POST', base + '/chat/completions', 'model=' + model);

fetch(base + '/chat/completions', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'count to five' }],
    max_tokens: 30,
    stream: true,
    stream_options: { include_usage: true },
  }),
  signal: AbortSignal.timeout(20000),
})
  .then(async (r) => {
    console.log('STATUS', r.status);
    if (!r.ok || !r.body) {
      console.log((await r.text()).slice(0, 400));
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let chunks = 0;
    let firstAt = 0;
    const start = Date.now();
    let sample = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (chunks === 0) firstAt = Date.now() - start;
      chunks += 1;
      if (chunks <= 2) sample += dec.decode(value);
    }
    console.log('stream chunks:', chunks, '| first byte after(ms):', firstAt);
    console.log('sample:', sample.replace(/\n/g, ' ').slice(0, 200));
  })
  .catch((e) => console.log('ERR', e.name, e.message));
