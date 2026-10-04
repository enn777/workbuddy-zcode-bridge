import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const state = join(root, 'state');
await mkdir(state, { recursive: true });
process.env.DSH_HOME = state;
let settings = {};
try { settings = JSON.parse((await readFile(join(root, 'settings.local.json'), 'utf8')).replace(/^\uFEFF/, '')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!process.env.WORKBUDDY_ELECTRON_BIN && settings.workbuddyElectronPath) {
  process.env.WORKBUDDY_ELECTRON_BIN = settings.workbuddyElectronPath;
}
const { CN_VARIANT, WorkBuddyCredentialStore, WorkBuddyUpstreamClient, WorkBuddyCatalog, createWorkBuddyShim } = await import('dsh-workbuddy-connect');
const client = new WorkBuddyUpstreamClient();
const store = new WorkBuddyCredentialStore({ variant: CN_VARIANT, ownPath: join(state, 'credentials.json'), refresh: c => client.refreshToken(c) });
const catalog = new WorkBuddyCatalog([]);
catalog.setUseMaximumContextWindow(true);

async function log(line) {
  try { await appendFile(join(root, 'bridge.log'), `[${new Date().toISOString()}] ${line}\n`); } catch {}
}

const credential = await store.resolve();
const models = await client.fetchModels(credential);
catalog.set(models);
await writeFile(join(state, 'models.json'), JSON.stringify(catalog.current(), null, 2));
let key;
try { key = (await readFile(join(state, 'bridge.key'), 'utf8')).trim(); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  key = randomBytes(32).toString('hex');
  await writeFile(join(state, 'bridge.key'), key, { mode: 0o600, flag: 'wx' });
}
const shim = createWorkBuddyShim({ store, client, catalog });
await shim.ready;
const port = Number(process.env.WORKBUDDY_CN_BRIDGE_PORT || 18348);
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function authorized(req) {
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${key}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function upstreamError(res, upstream) {
  let text = await upstream.text().catch(() => '');
  let data;
  try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 400) || `upstream HTTP ${upstream.status}`, type: 'upstream_error' } }; }
  await log(`upstream error http=${upstream.status} message=${String(data?.error?.message ?? '').slice(0, 200)}`);
  if (!res.headersSent) json(res, upstream.status, data); else res.destroy();
}
const server = createServer(async (req, res) => {
  try {
    if (!authorized(req)) return json(res, 401, { error: { message: 'Invalid bridge key', type: 'authentication_error' } });
    if (req.url === '/health' && req.method === 'GET') return json(res, 200, { ok: true, provider: 'workbuddy-cn', models: catalog.current().length });
    if (req.url === '/v1/models' && req.method === 'GET') return json(res, 200, { object: 'list', data: catalog.current().map(m => ({ id: m.id, object: 'model', owned_by: 'workbuddy-cn' })) });
    if (req.url !== '/v1/chat/completions' || req.method !== 'POST') return json(res, 404, { error: { message: 'Not found' } });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: { message: 'JSON content type required' } });
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) return json(res, 413, { error: { message: 'Request too large' } });
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { return json(res, 400, { error: { message: 'Invalid JSON' } }); }
    const model = catalog.current().find(m => m.id === body.model);
    if (!model) await log(`model "${body.model}" not in current catalog; forwarding to upstream anyway`);
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableFinished) controller.abort(); });
    const upstream = await fetch(`${shim.baseUrl()}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shim.token()}` },
      body: JSON.stringify({ ...body, stream: true }), signal: controller.signal,
    });
    if (!upstream.ok) return upstreamError(res, upstream);
    if (body.stream !== false) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      await pipeline(Readable.fromWeb(upstream.body), res);
    } else {
      const text = await upstream.text();
      const message = { role: 'assistant', content: '' };
      const tools = new Map();
      let finish = 'stop', usage, id;
      for (const line of text.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        let data;
        try { data = JSON.parse(payload); } catch { continue; }
        if (data.error) return json(res, 502, data);
        id ||= data.id;
        usage = data.usage || usage;
        const choice = data.choices?.[0];
        if (!choice) continue;
        finish = choice.finish_reason || finish;
        const delta = choice.delta || {};
        message.content += delta.content || '';
        if (delta.reasoning_content) message.reasoning_content = (message.reasoning_content || '') + delta.reasoning_content;
        for (const tool of delta.tool_calls || []) {
          const accumulated = tools.get(tool.index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
          accumulated.id = tool.id || accumulated.id;
          accumulated.function.name += tool.function?.name || '';
          accumulated.function.arguments += tool.function?.arguments || '';
          tools.set(tool.index, accumulated);
        }
      }
      if (tools.size) message.tool_calls = [...tools.values()];
      json(res, 200, { id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: body.model, choices: [{ index: 0, message, finish_reason: finish }], ...(usage ? { usage } : {}) });
    }
  } catch (error) {
    await log(`request failed: ${error.stack || error}`);
    if (!res.headersSent) json(res, 502, { error: { message: 'WorkBuddy request failed; check bridge log', type: 'upstream_error' } });
    else res.destroy();
  }
});
server.requestTimeout = 300_000;
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
await writeFile(join(state, 'runtime.json'), JSON.stringify({ pid: process.pid, port, provider: 'workbuddy-cn', baseUrl: `http://127.0.0.1:${port}/v1`, startedAt: new Date().toISOString() }));
await log(`WorkBuddy CN bridge ready: http://127.0.0.1:${port}/v1 (${models.length} models)`);
console.log(`WorkBuddy CN bridge ready: http://127.0.0.1:${port}/v1 (${models.length} models)`);
const timer = setInterval(async () => {
  try {
    const refreshed = await client.fetchModels(await store.resolve());
    catalog.set(refreshed);
    await writeFile(join(state, 'models.json'), JSON.stringify(catalog.current(), null, 2));
  }
  catch (error) { await log(`catalog refresh failed: ${error.message || error}`); }
}, 15 * 60 * 1000);
async function shutdown() { clearInterval(timer); server.closeAllConnections(); server.close(); await shim.close(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
