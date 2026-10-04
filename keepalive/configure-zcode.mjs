/**
 * Registers/updates the WorkBuddy local bridge providers in ZCode's
 * provider_config.json, as declared in bridges.json. Each provider's API key
 * is that bridge's own state/bridge.key; WorkBuddy tokens never appear in
 * this file. Idempotent: skips the write entirely when every provider entry
 * already matches the live catalogs.
 *
 * ZCODE_CONFIG_PATH overrides the ZCode config location (tests/special installs).
 */
import { readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const keepaliveRoot = dirname(fileURLToPath(import.meta.url));
const bridges = JSON.parse(await readFile(join(keepaliveRoot, 'bridges.json'), 'utf8'))
  .map(bridge => ({ ...bridge, stateDir: join(resolve(keepaliveRoot, bridge.dir), 'state') }));
const configPath = process.env.ZCODE_CONFIG_PATH || join(homedir(), '.zcode', 'v2', 'provider_config.json');
const original = await readFile(configPath, 'utf8');
const doc = JSON.parse(original);
if (doc.schemaVersion !== 1 || !doc.config?.providerConfigRules?.providerRules) throw new Error('Unrecognized ZCode configuration');

/** Key-order-insensitive JSON: ZCode re-serializes provider_config.json with
 * its own canonical key order, so equality must ignore key order. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  }
  return value;
}
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function desiredProvider(bridge, models) {
  return {
    providerId: bridge.providerId, providerName: bridge.providerName, enabled: true,
    config: {
      group: 'standard-personal', access: { type: 'api-key', apiKey: models.key },
      api: { type: 'openai-chat-completions', baseUrl: `http://127.0.0.1:${bridge.port}/v1` },
      personalModelIds: models.ids, modelOrder: models.ids,
    },
  };
}
function desiredModelRule(providerId, model) {
  return {
    providerId, modelId: model.id,
    config: {
      enabled: true,
      properties: {
        contextWindow: model.contextWindow, supportsToolCall: true,
        inputFormat: { supportsText: true, supportsImage: model.supportsImages === true },
      },
      optionSpecs: { maxOutputTokens: { max: model.maxTokens } },
    },
  };
}

const changes = [];
for (const bridge of bridges) {
  const key = (await readFile(join(bridge.stateDir, 'bridge.key'), 'utf8')).trim();
  const catalog = JSON.parse(await readFile(join(bridge.stateDir, 'models.json'), 'utf8'));
  const models = { key, ids: catalog.map(m => m.id) };
  const provider = desiredProvider(bridge, models);
  const providerRules = doc.config.providerConfigRules.providerRules;
  const existingProvider = providerRules.find(p => p.providerId === bridge.providerId);
  const existingModelRules = doc.config.modelConfigRules.providerModelRules.filter(r => r.providerId === bridge.providerId);
  const desiredRules = catalog.map(m => desiredModelRule(bridge.providerId, m));
  const sameProvider = existingProvider && same(existingProvider, provider);
  const sameRules = existingModelRules.length === desiredRules.length &&
    desiredRules.every((rule, i) => same(existingModelRules[i], rule));
  if (sameProvider && sameRules) { changes.push(`${bridge.providerId}: up to date`); continue; }
  if (existingProvider) providerRules[providerRules.indexOf(existingProvider)] = provider;
  else providerRules.push(provider);
  doc.config.providerOrder ||= [];
  if (!doc.config.providerOrder.includes(bridge.providerId)) doc.config.providerOrder.push(bridge.providerId);
  const rules = doc.config.modelConfigRules;
  rules.providerModelRules = rules.providerModelRules.filter(r => r.providerId !== bridge.providerId);
  rules.manualProviderModelRules = (rules.manualProviderModelRules || []).filter(r => r.providerId !== bridge.providerId);
  for (const rule of desiredRules) rules.providerModelRules.push(rule);
  changes.push(`${bridge.providerId}: updated (${catalog.length} models)`);
}
if (changes.every(c => c.includes('up to date'))) {
  console.log(changes.join('; '));
  process.exit(0);
}
await copyFile(configPath, `${configPath}.before-workbuddy.bak`);
if (await readFile(configPath, 'utf8') !== original) throw new Error('ZCode configuration changed concurrently; retry');
const temp = `${configPath}.workbuddy.tmp`;
await writeFile(temp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600 });
await rename(temp, configPath);
console.log(changes.join('; '));
