import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonObject, createChaosDirector } from './aiProvider.js';

test('extracts JSON from fenced or chatty model output', () => {
  assert.deepEqual(extractJsonObject('```json\n{"mechanic":"lava_tiles","name":"HOT {FLOOR}"}\n```'), { mechanic: 'lava_tiles', name: 'HOT {FLOOR}' });
  assert.deepEqual(extractJsonObject('Sure! Here you go: {"a":{"b":1}} hope that helps'), { a: { b: 1 } });
  assert.deepEqual(extractJsonObject('<think>{"no":1</think>{"ok":true}'), { ok: true });
  assert.equal(extractJsonObject('no json here'), undefined);
  assert.equal(extractJsonObject('{"broken": '), undefined);
});

test('provider selection: unconfigured, gemini key, local ollama', () => {
  assert.equal(createChaosDirector({ timeoutMs: 1000 }).configured, false);
  const g = createChaosDirector({ apiKey: 'k', model: 'gemma-4-26b-a4b-it', timeoutMs: 1000 });
  assert.equal(g.provider, 'gemini');
  assert.equal(g.model, 'gemma-4-26b-a4b-it');
  const o = createChaosDirector({ ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'gemma4:e2b-it-qat', timeoutMs: 1000 });
  assert.equal(o.provider, 'ollama');
  const forced = createChaosDirector({ provider: 'ollama', apiKey: 'k', ollamaModel: 'gemma4:e2b', timeoutMs: 1000 });
  assert.equal(forced.provider, 'ollama');
});
