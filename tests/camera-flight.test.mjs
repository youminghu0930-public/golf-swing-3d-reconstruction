import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from '../vendor/three/three.module.js';
import {interpolateRotation} from '../camera-flight.js';
const axis=new Vector3(0,1,0);
test('camera rotation advances during the flight when output aliases destination',()=>{
  const from=new Quaternion(),target=new Quaternion().setFromAxisAngle(axis,Math.PI/2);
  interpolateRotation(target,from,target,.5);
  assert.ok(Math.abs(from.angleTo(target)-Math.PI/4)<1e-7);
});
test('camera flight preserves its source and lands exactly at its destination',()=>{
  const from=new Quaternion().setFromAxisAngle(axis,-.5),to=new Quaternion().setFromAxisAngle(axis,1.4),saved=from.clone();
  for(const t of [0,.25,.5,.75,1]){
    const output=to.clone();interpolateRotation(output,from,output,t);
    assert.ok(output.angleTo(from.clone().slerp(to,t))<1e-7);
    assert.ok(from.angleTo(saved)<1e-7);
  }
});

test('ground constraint preserves orbit radius and keeps the camera above the floor',async()=>{
  const {PerspectiveCamera}=await import('../vendor/three/three.module.js');
  const {constrainCameraAboveGround}=await import('../camera-flight.js');
  const camera=new PerspectiveCamera();camera.position.set(2,-3,4);camera.lookAt(0,0,0);
  const radius=camera.position.length();
  constrainCameraAboveGround(camera,-1);
  assert.ok(camera.position.y>=-1);
  assert.ok(Math.abs(camera.position.length()-radius)<1e-8);
  const forward=new Vector3();camera.getWorldDirection(forward);
  assert.ok(forward.angleTo(camera.position.clone().negate())<1e-7);
});
