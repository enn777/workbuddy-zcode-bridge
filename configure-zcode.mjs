import { readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
const root = dirname(fileURLToPath(import.meta.url));
const configPath = process.env.ZCODE_CONFIG_PATH || join(homedir(), '.zcode', 'v2', 'provider_config.json');
const key = (await readFile(join(root, 'state', 'bridge.key'), 'utf8')).trim();
const models = JSON.parse(await readFile(join(root, 'state', 'models.json'), 'utf8'));
const original = await readFile(configPath, 'utf8');
const doc = JSON.parse(original);
if (doc.schemaVersion !== 1 || !Array.isArray(doc.config?.providerConfigRules?.providerRules)
  || !Array.isArray(doc.config?.modelConfigRules?.providerModelRules)
  || !Array.isArray(doc.config?.modelConfigRules?.manualProviderModelRules)) {
  throw new Error('Unrecognized ZCode configuration. Open ZCode once before running setup.');
}
if (!key || !Array.isArray(models) || models.length === 0) throw new Error('Bridge key or model catalog missing; start the bridge first.');
const providerId = 'workbuddy-ai-local';
const providerRules = doc.config.providerConfigRules.providerRules;
const existing = providerRules.find(p => p.providerId === providerId);
const provider = {
  providerId, providerName: 'WorkBuddy AI (Local)', enabled: true,
  config: {
    group: 'standard-personal', access: { type: 'api-key', apiKey: key },
    api: { type: 'openai-chat-completions', baseUrl: 'http://127.0.0.1:18347/v1' },
    personalModelIds: models.map(m => m.id), modelOrder: models.map(m => m.id),
  },
};
if (existing) providerRules[providerRules.indexOf(existing)] = provider;
else providerRules.push(provider);
doc.config.providerOrder ||= [];
if (!doc.config.providerOrder.includes(providerId)) doc.config.providerOrder.push(providerId);
const rules = doc.config.modelConfigRules;
rules.providerModelRules = rules.providerModelRules.filter(r => r.providerId !== providerId);
rules.manualProviderModelRules = rules.manualProviderModelRules.filter(r => r.providerId !== providerId);
for (const model of models) rules.providerModelRules.push({
  providerId, modelId: model.id,
  config: {
    enabled: true,
    properties: {
      contextWindow: model.contextWindow, supportsToolCall: true,
      inputFormat: { supportsText: true, supportsImage: model.supportsImages === true },
    },
    optionSpecs: { maxOutputTokens: { max: model.maxTokens } },
  },
});
await copyFile(configPath, `${configPath}.before-workbuddy-${Date.now()}.bak`);
if (await readFile(configPath, 'utf8') !== original) throw new Error('ZCode configuration changed; retry');
const temp = `${configPath}.workbuddy.tmp`;
await writeFile(temp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600 });
await rename(temp, configPath);
console.log(`Added ${provider.providerName} with ${models.length} models; existing providers preserved.`);
