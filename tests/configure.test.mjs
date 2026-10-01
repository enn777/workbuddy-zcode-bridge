import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('provider merge preserves existing providers and remains idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-config-test-'));
  try {
    await copyFile(new URL('../configure-zcode.mjs', import.meta.url), join(root, 'configure-zcode.mjs'));
    await mkdir(join(root, 'state'));
    await writeFile(join(root, 'state', 'bridge.key'), 'test-only-local-key');
    await writeFile(join(root, 'state', 'models.json'), JSON.stringify([
      { id: 'test-model', contextWindow: 32000, maxTokens: 2048, supportsImages: true },
    ]));
    const path = join(root, 'provider_config.json');
    const original = {
      schemaVersion: 1,
      config: {
        providerOrder: ['existing'],
        defaultModel: { providerId: 'existing', modelId: 'keep-me' },
        providerConfigRules: { providerRules: [{ providerId: 'existing', config: { retained: true } }] },
        modelConfigRules: { providerModelRules: [{ providerId: 'existing', modelId: 'keep-me' }], manualProviderModelRules: [] },
      },
    };
    const originalText = JSON.stringify(original);
    await writeFile(path, originalText);
    const run = () => spawnSync(process.execPath, [join(root, 'configure-zcode.mjs')], {
      env: { ...process.env, ZCODE_CONFIG_PATH: path }, encoding: 'utf8',
    });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const configured = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(configured.config.providerConfigRules.providerRules[0], original.config.providerConfigRules.providerRules[0]);
    assert.deepEqual(configured.config.defaultModel, original.config.defaultModel);
    assert.deepEqual(configured.config.modelConfigRules.providerModelRules[0], original.config.modelConfigRules.providerModelRules[0]);
    assert.deepEqual(configured.config.providerOrder, ['existing', 'workbuddy-ai-local']);
    assert.equal(configured.config.modelConfigRules.providerModelRules[1].config.properties.inputFormat.supportsImage, true);
    const backup = (await readdir(root)).find(name => name.endsWith('.bak'));
    assert.equal(await readFile(join(root, backup), 'utf8'), originalText);
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), configured);
    const invalid = '{"schemaVersion":99,"config":{}}';
    await writeFile(path, invalid);
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(path, 'utf8'), invalid);
  } finally { await rm(root, { recursive: true, force: true }); }
});
