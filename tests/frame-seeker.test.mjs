import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameSeeker } from '../frame-seeker.js';

class Decoder extends EventTarget {
  seeking = false;
  time = 0;
  requests = [];
  get currentTime() { return this.time; }
  set currentTime(time) {
    assert.equal(this.seeking, false, 'Do not interrupt an outstanding decoder seek');
    this.time = time;
    this.seeking = true;
    this.requests.push(time);
  }
  complete() { this.seeking = false; this.dispatchEvent(new Event('seeked')); }
}
function setup() {
  const video = new Decoder(), requested = [], displayed = [];
  const times = Array.from({ length: 80 }, (_, index) => index / 30);
  const seeker = createFrameSeeker(video, {
    getTimes: () => times,
    onRequest: frame => requested.push(frame),
    onSettled: frame => displayed.push(frame)
  });
  return { video, seeker, requested, displayed };
}

test('rapid next clicks accumulate while the decoder is still seeking', async () => {
  const { video, seeker, requested, displayed } = setup();
  seeker.request(1); seeker.request(2); seeker.request(3);
  assert.deepEqual(requested, [1, 2, 3]);
  assert.equal(video.requests.length, 1);
  let idle = false;
  const completion = seeker.whenIdle().then(() => { idle = true; });
  video.complete();
  assert.deepEqual(displayed, [1], 'A held key must still present completed intermediate frames');
  assert.equal(video.requests.length, 2);
  assert.equal(idle, false);
  video.complete();
  await completion;
  assert.deepEqual(displayed, [1, 3]);
  assert.equal(idle, true);
});

test('alternating previous/next and scrub inputs preserve the final request', () => {
  const { video, seeker, displayed } = setup();
  for (const index of [30, 29, 28, 29, 60, 4]) seeker.request(index);
  video.complete(); video.complete();
  assert.deepEqual(displayed, [30, 4]);
  assert.ok(Math.abs(video.currentTime - (4 / 30 + 0.01)) < 0.000001);
});

test('boundaries clamp and replacing a clip discards obsolete seek completion', async () => {
  const { video, seeker, requested, displayed } = setup();
  seeker.request(1000);
  assert.deepEqual(requested, [79]);
  seeker.reset(); video.complete();
  assert.deepEqual(displayed, []);
  seeker.request(-1); video.complete();
  await seeker.whenIdle();
  assert.deepEqual(displayed, [0]);
});

test('seeked does not draw until the requested video frame has been presented', () => {
  const { video, seeker, displayed } = setup();
  let callback;
  video.requestVideoFrameCallback = fn => { callback = fn; return 1; };
  seeker.request(10);
  video.complete();
  assert.deepEqual(displayed, [], 'The old video texture must not be drawn');
  callback(0, { mediaTime: 0 });
  assert.deepEqual(displayed, [], 'Ignore a compositor callback for an older frame');
  callback(0, { mediaTime: 10 / 30 });
  assert.deepEqual(displayed, [10]);
});

test('frame presentation before seeked still waits for decoder seek completion', () => {
  const { video, seeker, displayed } = setup();
  let callback;
  video.requestVideoFrameCallback = fn => { callback = fn; return 1; };
  seeker.request(20);
  callback(0, { mediaTime: 20 / 30 });
  assert.deepEqual(displayed, []);
  video.complete();
  assert.deepEqual(displayed, [20]);
});

test('a mobile decoder that withholds presentation callbacks does not lock frame controls', async () => {
  const { video, seeker, displayed } = setup();
  video.requestVideoFrameCallback = () => 1;
  video.cancelVideoFrameCallback = () => {};
  seeker.request(5); video.complete();
  await seeker.whenIdle();
  assert.deepEqual(displayed, [5]);
  seeker.request(6); video.complete();
  await seeker.whenIdle();
  assert.deepEqual(displayed, [5, 6]);
});

test('reset cancels a pending mobile presentation fallback', async () => {
  const { video, seeker, displayed } = setup();
  video.requestVideoFrameCallback = () => 1;
  seeker.request(5); video.complete(); seeker.reset();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(displayed, []);
});
