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

console.log('POST', base + '/chat/completions', 'model=' + model);

fetch(base + '/chat/completions', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
  signal: AbortSignal.timeout(20000),
})
  .then((r) => r.text().then((b) => console.log('STATUS', r.status, '\n' + b.slice(0, 400))))
  .catch((e) => console.log('ERR', e.name, e.message));
