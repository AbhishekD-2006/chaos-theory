import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChaosEvent, MECHANIC_IDS, MECHANICS, sanitizeText } from './chaosSchema.js';

test('rejects mechanics that are not on the allowlist', () => {
  const r = validateChaosEvent({ name: 'X', mechanic: 'delete_player', durationSeconds: 5 });
  assert.equal(r.ok, false);
  assert.equal(validateChaosEvent(null).ok, false);
  assert.equal(validateChaosEvent('reverse_controls').ok, false);
});

test('clamps duration, difficulty and parameters into safe ranges', () => {
  const r = validateChaosEvent({
    name: 'Mega Lava',
    description: 'hot',
    mechanic: 'lava_tiles',
    durationSeconds: 999,
    difficulty: -4,
    parameters: { tileFraction: 0.95, cycleSeconds: 0.1, evil: 1 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.event.durationSeconds, 10);
  assert.equal(r.event.difficulty, 1);
  assert.equal(r.event.parameters.tileFraction, MECHANICS.lava_tiles.params.tileFraction.max);
  assert.equal(r.event.parameters.cycleSeconds, MECHANICS.lava_tiles.params.cycleSeconds.min);
  assert.equal('evil' in r.event.parameters, false);
});

test('fills missing parameters with difficulty-scaled defaults', () => {
  for (const mechanic of MECHANIC_IDS) {
    const r = validateChaosEvent({ mechanic, difficulty: 3 });
    assert.equal(r.ok, true);
    for (const [key, spec] of Object.entries(MECHANICS[mechanic].params)) {
      const v = r.event.parameters[key];
      assert.ok(v >= spec.min && v <= spec.max, `${mechanic}.${key}=${v}`);
    }
  }
});

test('sanitizes text so model output cannot inject markup', () => {
  const r = validateChaosEvent({
    mechanic: 'giant_mode',
    name: '<img src=x onerror=alert(1)>big   boi',
    description: '<script>alert(1)</script>' + 'a'.repeat(300),
  });
  assert.equal(r.ok, true);
  assert.equal(r.event.name, 'BIG BOI');
  assert.ok(!r.event.description.includes('<'));
  assert.ok(r.event.description.length <= 110);
  assert.equal(sanitizeText(42, 10), '');
});

test('keeps a sanitized, length-limited taunt', () => {
  const r = validateChaosEvent({ mechanic: 'giant_mode', taunt: '<b>Nice</b> corner camping {lol} ' + 'x'.repeat(200) });
  assert.equal(r.ok, true);
  assert.ok(r.event.taunt.startsWith('Nice corner camping lol'));
  assert.ok(r.event.taunt.length <= 90);
  assert.equal(validateChaosEvent({ mechanic: 'giant_mode' }).event.taunt, '');
});
