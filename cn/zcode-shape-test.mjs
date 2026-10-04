/**
 * Sends the shapes ZCode's openai-chat-completions provider plausibly emits
 * and reports which ones the WorkBuddy upstream accepts. Usage:
 *   node zcode-shape-test.mjs <port> <model>
 */
import { readFile } from 'node:fs/promises';
const [port, model] = process.argv.slice(2);
const root = new URL('.', import.meta.url);
const key = (await readFile(new URL('./state/bridge.key', root), 'utf8')).trim();
const base = `http://127.0.0.1:${port}`;
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const tools = [{ type: 'function', function: { name: 'add', description: 'Add two numbers', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'], additionalProperties: false } } }];
const cases = {
  'zcode-baseline (stream + system + tools + stream_options)': {
    stream: true, stream_options: { include_usage: true },
    messages: [{ role: 'system', content: 'You are a coding assistant.' }, { role: 'user', content: 'Reply with exactly OK.' }],
    tools, tool_choice: 'auto', temperature: 0.7, top_p: 0.9, max_tokens: 64,
  },
  'developer role message': {
    stream: true, stream_options: { include_usage: true },
    messages: [{ role: 'developer', content: 'You are a coding assistant.' }, { role: 'user', content: 'Reply with exactly OK.' }],
    max_tokens: 64,
  },
  'tool_choice object form': {
    stream: true, stream_options: { include_usage: true },
    messages: [{ role: 'user', content: 'Use the add tool for 2 plus 3.' }],
    tools, tool_choice: { type: 'function', function: { name: 'add' } }, max_tokens: 128,
  },
  'max_completion_tokens + penalties + n + stop + user': {
    stream: true, stream_options: { include_usage: true },
    messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
    max_completion_tokens: 64, temperature: 0.7, top_p: 0.9, presence_penalty: 0, frequency_penalty: 0, n: 1, stop: ['\n\n'], user: 'zcode-test',
  },
  'response_format text': {
    stream: true, stream_options: { include_usage: true },
    messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
    response_format: { type: 'text' }, max_tokens: 64,
  },
  'reasoning_effort low': {
    stream: true, stream_options: { include_usage: true },
    messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
    reasoning_effort: 'low', max_tokens: 64,
  },
};
const results = [];
for (const [name, body] of Object.entries(cases)) {
  const probe = { model, ...body };
  try {
    const response = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify(probe), signal: AbortSignal.timeout(90000) });
    const text = await response.text();
    let detail = '';
    if (response.status === 200) {
      const content = [...text.matchAll(/"content":"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).join('');
      detail = `content~="${content.slice(0, 40)}"`;
    } else {
      detail = text.replace(/\s+/g, ' ').slice(0, 220);
    }
    results.push(`${response.status === 200 ? 'PASS' : 'FAIL'}  ${name}${response.status === 200 ? '' : `  [http ${response.status}] ${detail}`}`);
  } catch (error) {
    results.push(`FAIL  ${name}  [transport] ${String(error).slice(0, 160)}`);
  }
}
console.log(`--- ${port} / ${model} ---`);
for (const line of results) console.log(line);
