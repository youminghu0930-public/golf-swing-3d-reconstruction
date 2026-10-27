import test from 'node:test';
import assert from 'node:assert/strict';
import { installFrameKeys } from '../frame-keys.js';
function keyboard(target, type, key, extra = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), { key, ...extra });
  target.dispatchEvent(event);
  return event;
}
test('a tap steps once without starting a repeat timer', t => {
  const target = new EventTarget(), moves = [];
  t.mock.method(globalThis, 'setInterval', () => { throw Error('No automatic repeat timer'); });
  installFrameKeys({ target, blurTarget: new EventTarget(), isReady: () => true, step: delta => moves.push(delta) });
  const down = keyboard(target, 'keydown', 'ArrowRight');
  keyboard(target, 'keydown', 'ArrowRight');
  keyboard(target, 'keyup', 'ArrowRight');
  assert.deepEqual(moves, [1]); assert.equal(down.defaultPrevented, true);
});
test('only native repeats advance a hold; release and blur discard stale repeats', () => {
  const target = new EventTarget(), blurTarget = new EventTarget(), moves = [];
  installFrameKeys({ target, blurTarget, isReady: () => true, step: delta => moves.push(delta) });
  keyboard(target, 'keydown', 'ArrowLeft');
  keyboard(target, 'keydown', 'ArrowLeft', { repeat: true });
  keyboard(target, 'keydown', 'ArrowLeft', { repeat: true });
  assert.deepEqual(moves, [-1, -1, -1]);
  keyboard(target, 'keyup', 'ArrowLeft');
  keyboard(target, 'keydown', 'ArrowLeft', { repeat: true });
  assert.equal(moves.length, 3);
  keyboard(target, 'keydown', 'ArrowRight');
  blurTarget.dispatchEvent(new Event('blur'));
  keyboard(target, 'keydown', 'ArrowRight', { repeat: true });
  assert.equal(moves.length, 4);
});
test('modified shortcuts and unloaded video do not step', () => {
  const target = new EventTarget(), moves = [];
  installFrameKeys({ target, blurTarget: new EventTarget(), isReady: () => false, step: delta => moves.push(delta) });
  assert.equal(keyboard(target, 'keydown', 'ArrowLeft', { metaKey: true }).defaultPrevented, false);
  keyboard(target, 'keydown', 'ArrowRight'); assert.deepEqual(moves, []);
});
test('Space toggles once per press and prevents focused controls handling either key event', () => {
  const target = new EventTarget(); let toggles = 0, leaked = 0;
  installFrameKeys({ target, blurTarget: new EventTarget(), isReady: () => true, step: () => {}, toggle: () => toggles++ });
  target.addEventListener('keydown', () => leaked++);
  target.addEventListener('keyup', () => leaked++);
  assert.equal(keyboard(target, 'keydown', ' ').defaultPrevented, true);
  keyboard(target, 'keydown', ' ', { repeat: true });
  keyboard(target, 'keydown', ' ', { repeat: true });
  assert.equal(toggles, 1);
  assert.equal(keyboard(target, 'keyup', ' ').defaultPrevented, true);
  keyboard(target, 'keydown', ' '); keyboard(target, 'keyup', ' ');
  assert.equal(toggles, 2); assert.equal(leaked, 0);
});
