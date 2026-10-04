/**
 * Keepalive for the WorkBuddy local bridges declared in bridges.json. Runs
 * from Task Scheduler (every 5 minutes + at logon) and can be run by hand:
 *   node keepalive.mjs
 * For each bridge: GET /health with the bridge's own key; if unhealthy,
 * start one instance and wait for readiness. Afterwards sync the ZCode
 * provider model lists (idempotent; writes only on change).
 */
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const keepaliveRoot = dirname(fileURLToPath(import.meta.url));
const bridges = JSON.parse(await readFile(join(keepaliveRoot, 'bridges.json'), 'utf8'))
  .map(bridge => ({ ...bridge, root: resolve(keepaliveRoot, bridge.dir) }));
const nodePath = process.execPath;

async function log(line) {
  try {
    await mkdir(keepaliveRoot, { recursive: true });
    await appendFile(join(keepaliveRoot, 'keepalive.log'), `[${new Date().toISOString()}] ${line}\n`);
  } catch {}
}
async function healthy(bridge) {
  try {
    const key = (await readFile(join(bridge.root, 'state', 'bridge.key'), 'utf8')).trim();
    const response = await fetch(`http://127.0.0.1:${bridge.port}/health`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.ok === true;
  } catch { return false; }
}
function startBridge(bridge) {
  const child = spawn(nodePath, [join(bridge.root, 'bridge.mjs')], {
    cwd: bridge.root,
    detached: true,
    windowsHide: true,
    stdio: ['ignore',
      openSync(join(bridge.root, 'bridge-stdout.log'), 'a'),
      openSync(join(bridge.root, 'bridge-error.log'), 'a')],
  });
  child.unref();
  return child.pid;
}

const started = [];
for (const bridge of bridges) {
  if (await healthy(bridge)) continue;
  started.push(bridge.name);
  await log(`${bridge.name} unhealthy or not running on port ${bridge.port}; starting.`);
  startBridge(bridge);
  const deadline = Date.now() + 60_000;
  let ok = false;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 800));
    if (await healthy(bridge)) { ok = true; break; }
  }
  await log(`${bridge.name} start ${ok ? 'succeeded' : 'timed out; check bridge-error.log'}`);
}
try {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const result = await promisify(execFile)(nodePath, [join(keepaliveRoot, 'configure-zcode.mjs')], { timeout: 30_000 });
  if (result.stdout && !result.stdout.includes('up to date')) await log(`configure-zcode: ${result.stdout.trim()}`);
  if (result.stderr) await log(`configure-zcode stderr: ${result.stderr.trim().slice(0, 300)}`);
} catch (error) {
  await log(`configure-zcode failed: ${String(error.message || error).slice(0, 300)}`);
}
if (started.length === 0) console.log('All bridges healthy; ZCode config in sync.');
