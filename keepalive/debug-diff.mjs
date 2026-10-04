/** Debug: compares on-disk ZCode model rules vs desired for every bridge in
 * bridges.json. Prints the first mismatch. Read-only; never writes. */
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const keepaliveRoot = dirname(fileURLToPath(import.meta.url));
const bridges = JSON.parse(await readFile(join(keepaliveRoot, 'bridges.json'), 'utf8'))
  .map(bridge => ({ ...bridge, stateDir: join(resolve(keepaliveRoot, bridge.dir), 'state') }));
const doc = JSON.parse(await readFile(process.env.ZCODE_CONFIG_PATH || join(homedir(), '.zcode', 'v2', 'provider_config.json'), 'utf8'));
/** Key-order-insensitive, matching configure-zcode.mjs (ZCode re-serializes with its own key order). */
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
    : value;
for (const bridge of bridges) {
  const catalog = JSON.parse(await readFile(join(bridge.stateDir, 'models.json'), 'utf8'));
  const onDisk = doc.config.modelConfigRules.providerModelRules.filter(r => r.providerId === bridge.providerId);
  const desired = catalog.map(m => ({
    providerId: bridge.providerId, modelId: m.id,
    config: {
      enabled: true,
      properties: {
        contextWindow: m.contextWindow, supportsToolCall: true,
        inputFormat: { supportsText: true, supportsImage: m.supportsImages === true },
      },
      optionSpecs: { maxOutputTokens: { max: m.maxTokens } },
    },
  }));
  let mismatch = null;
  if (onDisk.length !== desired.length) mismatch = `count: disk=${onDisk.length} desired=${desired.length}`;
  else for (let i = 0; i < desired.length; i++) {
    if (JSON.stringify(stable(onDisk[i])) !== JSON.stringify(stable(desired[i]))) { mismatch = `rule ${i}: disk=${JSON.stringify(onDisk[i])}\n  desired=${JSON.stringify(desired[i])}`; break; }
  }
  const providerEntry = doc.config.providerConfigRules.providerRules.find(p => p.providerId === bridge.providerId);
  const providerOk = providerEntry && providerEntry.config.personalModelIds.join(',') === catalog.map(m => m.id).join(',');
  console.log(`${bridge.providerId}: rules ${mismatch ? 'MISMATCH ' + mismatch : 'match'}; providerEntry ${providerOk ? 'match' : 'MISMATCH'}`);
}
