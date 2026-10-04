/** Live smoke test: one minimal streaming request per bridge declared in bridges.json. */
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const keepaliveRoot = dirname(fileURLToPath(import.meta.url));
const bridges = JSON.parse(await readFile(join(keepaliveRoot, 'bridges.json'), 'utf8'))
  .map(bridge => ({ ...bridge, root: resolve(keepaliveRoot, bridge.dir) }));
async function testOne(bridge) {
  const key = (await readFile(join(bridge.root, 'state', 'bridge.key'), 'utf8')).trim();
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const health = await (await fetch(`http://127.0.0.1:${bridge.port}/health`, { headers, signal: AbortSignal.timeout(5000) })).json();
  const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/chat/completions`, {
    method: 'POST', headers, signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      // Reasoning models spend max_tokens on reasoning_content first, so keep
      // this budget generous or content can legitimately come back empty.
      model: bridge.smokeModel || 'glm-5.3-flash', stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'user', content: 'Reply with exactly: PONG' }], max_tokens: 512,
    }),
  });
  const text = await response.text();
  let content = '', reasoning = '';
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') continue;
    try {
      const delta = JSON.parse(payload).choices?.[0]?.delta || {};
      content += delta.content || '';
      reasoning += delta.reasoning_content || '';
    } catch {}
  }
  const ok = health.ok === true && response.status === 200 && /\[DONE\]/.test(text) && content.trim() !== '';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${bridge.name} ${bridge.port}: health=${health.ok} models=${health.models} http=${response.status} reasoning=${reasoning.length}ch content="${content.trim()}"`);
  return ok;
}
const results = [];
for (const bridge of bridges) results.push(await testOne(bridge));
process.exit(results.every(Boolean) ? 0 : 1);
