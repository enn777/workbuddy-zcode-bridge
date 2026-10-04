import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('provider merge registers both bridges, preserves existing providers, and remains idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-config-test-'));
  try {
    await copyFile(new URL('../keepalive/configure-zcode.mjs', import.meta.url), join(root, 'configure-zcode.mjs'));
    const bridges = [
      { name: 'workbuddy-ai', port: 18347, dir: './state-ai', providerId: 'workbuddy-ai-local', providerName: 'WorkBuddy AI (Local)' },
      { name: 'workbuddy-cn', port: 18348, dir: './state-cn', providerId: 'workbuddy-cn-local', providerName: 'WorkBuddy CN (Local)' },
    ];
    await writeFile(join(root, 'bridges.json'), JSON.stringify(bridges, null, 2));
    const catalogs = {
      'state-ai': [{ id: 'test-model', contextWindow: 32000, maxTokens: 2048, supportsImages: true }],
      'state-cn': [{ id: 'cn-model', contextWindow: 128000, maxTokens: 4096, supportsImages: false }],
    };
    for (const [dir, models] of Object.entries(catalogs)) {
      await mkdir(join(root, dir, 'state'), { recursive: true });
      await writeFile(join(root, dir, 'state', 'bridge.key'), `test-only-local-key-${dir}`);
      await writeFile(join(root, dir, 'state', 'models.json'), JSON.stringify(models));
    }
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
    assert.deepEqual(configured.config.providerOrder, ['existing', 'workbuddy-ai-local', 'workbuddy-cn-local']);
    assert.equal(configured.config.modelConfigRules.providerModelRules[1].config.properties.inputFormat.supportsImage, true);
    assert.equal(configured.config.modelConfigRules.providerModelRules[2].config.properties.inputFormat.supportsImage, false);
    const backup = (await readdir(root)).find(name => name.endsWith('.bak'));
    assert.equal(await readFile(join(root, backup), 'utf8'), originalText);
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /up to date/);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), configured);
    const invalid = '{"schemaVersion":99,"config":{}}';
    await writeFile(path, invalid);
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(path, 'utf8'), invalid);
  } finally { await rm(root, { recursive: true, force: true }); }
});
