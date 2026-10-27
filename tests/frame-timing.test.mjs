import test from 'node:test';
import assert from 'node:assert/strict';
import {frameAtTime} from '../frame-timing.js';
test('decoded timestamps select the actual frame rather than rounded fps estimates',()=>{
  const times=[0,.033367,.066733,.100100,.166834];
  assert.equal(frameAtTime(times,.066733),2);
  assert.equal(frameAtTime(times,.16),3);
  assert.equal(frameAtTime(times,-1),0);
  assert.equal(frameAtTime(times,5),4);
});
