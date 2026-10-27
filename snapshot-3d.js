import * as THREE from './vendor/three/three.module.js';
const names = ['nose','atlas','top_head','left_ear','right_ear','left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist','left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle','golf_club_grip','golf_club_shaft','golf_club_heel','golf_club_head'];
const edges = [[0,1],[0,2],[0,3],[0,4],[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16],[17,19],[19,20]];
const valid = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
async function json(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json(); }
export async function mountSnapshots(root, { showCameras = false } = {}) {
  const config = await json('materials/data/snapshot.json');
  const title = document.createElement('h3'); title.textContent = '3D snapshot highlights'; root.append(title);
  const entries=Object.entries(config);
  if(!entries.length)return;
  const shell=document.createElement('div');shell.className='snapshot-shell';
  shell.setAttribute('role','region');shell.setAttribute('aria-roledescription','carousel');shell.setAttribute('aria-label','3D snapshot highlights');
  const wheel=document.createElement('div');wheel.className='snapshot-wheel';shell.append(wheel);
  const dots=document.createElement('div');dots.className='snapshot-dots';dots.setAttribute('aria-label','Choose a snapshot');
  const cards=[],buttons=[];let index=0;
  function select(next) {
    index=(next+cards.length)%cards.length;
    cards.forEach((card,i)=>{
      let offset=i-index;
      if(offset>cards.length/2)offset-=cards.length;
      if(offset< -cards.length/2)offset+=cards.length;
      card.classList.toggle('is-current',i===index);
      card.inert=i!==index;card.setAttribute('aria-hidden',String(i!==index));
      card.style.transform=`translateX(-50%) translate(${offset*48}px, ${Math.abs(offset)*12}px) scale(${i===index?1:.9})`;
      card.style.zIndex=String(cards.length-Math.abs(offset));
      card.style.opacity=Math.abs(offset)>1?'0':i===index?'1':'.5';
      buttons[i].setAttribute('aria-current',String(i===index));
    });
  }
  for (const [id, entry] of entries) {
    const card=document.createElement('article');card.className='pose-snapshot snapshot-card';
    card.setAttribute('aria-roledescription','slide');card.setAttribute('aria-label',`Swing ${id}`);
    wheel.append(card);cards.push(card);
    const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`Show swing ${id}`);button.append(document.createElement('span'));
    const position=cards.length-1;button.onclick=()=>select(position);dots.append(button);buttons.push(button);
  }
  for(const [direction,label,step] of [['previous','Previous snapshot',-1],['next','Next snapshot',1]]) {
    const button=document.createElement('button');button.type='button';button.className=`snapshot-arrow snapshot-${direction}`;button.setAttribute('aria-label',label);
    button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${step<0?'M15 5l-7 7 7 7':'M9 5l7 7-7 7'}"/></svg>`;
    button.onclick=()=>select(index+step);button.hidden=entries.length<2;shell.append(button);
  }
  root.append(shell,dots);select(0);
  await Promise.all(entries.map(async ([id,entry],i)=>{
    try { await mountCard(cards[i],id,entry,{showCameras}); }
    catch(error){console.error(error);cards[i].textContent=`Swing ${id}: ${error.message}`;}
  }));

}
async function mountCard(card, id, entry, { showCameras }) {
  const {reconstruction: frames, calibration} = await json(`materials/data/3d_results/${encodeURIComponent(id)}.json`);
  const configuredRange = entry.range ?? entry.ranage;
  const range = Array.isArray(configuredRange)
    ? configuredRange.map((value,index)=>value === null ? (index === 0 ? 0 : frames.length-1) : value)
    : configuredRange;
  if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger) || range[0] < 0 || range[1] < range[0] || range[1] >= frames.length) throw new Error('Invalid snapshot frame range');
  const [start,end] = range;
  const joints = (entry.joints || []).map(name => name === 'golf_club_haed' ? 'golf_club_head' : name);
  if (joints.some(name => !names.includes(name))) throw new Error('Unknown trail joint');
  let frame = Math.min(end, Math.max(start, entry.highlight_index ?? start));
  let yaw = 0, pitch = 0, zoom = 1, distanceScale = 1;
  const heading = document.createElement('h4'); heading.textContent = `Swing ${id}`;
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', `Rotatable 3D pose for swing ${id}`); canvas.setAttribute('role','img');
  card.append(heading,canvas);
  const points = frames.slice(start,end+1).flat().filter(valid);
  if (!points.length) throw new Error('No valid 3D points');
  const min = [0,1,2].map(axis => Math.min(...points.map(p=>p[axis])));
  const max = [0,1,2].map(axis => Math.max(...points.map(p=>p[axis])));
  const center = min.map((v,i)=>(v+max[i])/2);
  const radius = Math.max(...points.map(p=>Math.hypot(...p.map((v,i)=>v-center[i])))) || 1;
  const median = values => { const sorted = values.sort((a,b)=>a-b); return sorted[Math.floor(sorted.length/2)]; };
  const selectedFrames = frames.slice(start,end+1);
  const groundY = median(selectedFrames.map(pose => Math.max(...[pose[15],pose[16]].filter(valid).map(p=>p[1]))).filter(Number.isFinite));
  const height = groundY - median(selectedFrames.map(pose=>pose[2]).filter(valid).map(p=>p[1]));
  const targetStep = (height > 0 ? height : radius*2)/8;
  const power = 10**Math.floor(Math.log10(targetStep));
  const gridStep = [1,2,5,10].map(n=>n*power).reduce((a,b)=>Math.abs(a-targetStep)<Math.abs(b-targetStep)?a:b);
  // Use the median hip midpoint as the fixed body center for this snapshot.
  const bodyCenters = selectedFrames.filter(pose=>valid(pose[11])&&valid(pose[12])).map(pose=>pose[11].map((v,i)=>(v+pose[12][i])/2));
  const groundX = bodyCenters.length ? median(bodyCenters.map(p=>p[0])) : center[0];
  const groundZ = bodyCenters.length ? median(bodyCenters.map(p=>p[2])) : center[2];
  const extent = Math.max(...points.map(p=>Math.max(Math.abs(p[0]-groundX),Math.abs(p[2]-groundZ)))) || gridStep;
  // Rotate camera coordinates into a right-handed rendering space:
  // source +X is right, source -Y is up, and source +Z points into the screen.
  const unit = height > 0 ? height : radius;
  const vector = p => new THREE.Vector3((p[0]-center[0])/unit, -(p[1]-center[1])/unit, -(p[2]-center[2])/unit);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f7f0');
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const camera = new THREE.PerspectiveCamera(45,1,.01,100);
  const bound = radius/unit;
  scene.add(new THREE.HemisphereLight('#ffffff','#7d8974',2));
  const light = new THREE.DirectionalLight('#fff6df',3);
  light.position.set(-2,4,3); light.castShadow = true;
  light.shadow.mapSize.set(2048,2048);
  const shadowExtent = Math.max(3,bound*1.8);
  Object.assign(light.shadow.camera,{left:-shadowExtent,right:shadowExtent,top:shadowExtent,bottom:-shadowExtent,near:.1,far:20});
  light.shadow.normalBias = .005; light.shadow.bias = -.00015;
  scene.add(light);
  const fill = new THREE.DirectionalLight('#dceaff',1); fill.position.set(3,1,-3); scene.add(fill);
  const material = color => new THREE.MeshStandardMaterial({color,roughness:.38,metalness:.08});
  const boneMaterial = material('#63f5b4');
  const jointMaterials = {left:material('#3b82f6'),right:material('#ef4444'),center:boneMaterial};
  const boneRadius = .012, jointRadius = .022;
  const cylinder = new THREE.CylinderGeometry(1,1,1,16);
  const sphere = new THREE.SphereGeometry(jointRadius,24,16);
  const axis = new THREE.Vector3(0,1,0);
  const bones = edges.map(([a,b])=>{
    const mesh = new THREE.Mesh(cylinder,boneMaterial); mesh.castShadow = mesh.receiveShadow = true;scene.add(mesh);return {a,b,mesh};
  });
  const dots = names.map((name,i)=>{
    if(i===18)return null;
    const mesh = new THREE.Mesh(sphere,jointMaterials[name.startsWith('left_')?'left':name.startsWith('right_')?'right':'center']);
    mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh;
  });
  // Prebuild timestamped solid trail segments; reveal only samples reached by playback.
  const trails=[];
  const trailCylinder=new THREE.CylinderGeometry(1,1,1,8);
  const trailSphere=new THREE.SphereGeometry(.006,8,6);
  const transform=new THREE.Object3D();
  const fps = Number.isFinite(entry.fps) && entry.fps > 0 ? entry.fps : 60;
  // One fixed scale across the full reconstruction, including frames outside
  // the displayed range, keeps red reserved for the sequence's peak speed.
  const speeds = new Map(); let peakSpeed=0;
  for(const name of joints){
    const index=names.indexOf(name),values=new Float64Array(frames.length);
    for(let f=1;f<frames.length;f++){
      const a=frames[f-1]?.[index],b=frames[f]?.[index];
      if(!valid(a)||!valid(b))continue;
      values[f]=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])*fps;
      peakSpeed=Math.max(peakSpeed,values[f]);
    }
    speeds.set(name,values);
  }
  joints.forEach(name=>{
    const index=names.indexOf(name),segments=[],samples=[];
    for(let f=start;f<=end;f++) {
      const point=frames[f]?.[index];if(!valid(point))continue;
      const to=vector(point);samples.push({point:to,frame:f});
      const previous=frames[f-1]?.[index];
      if(f===start||!valid(previous))continue;
      const from=vector(previous),delta=to.clone().sub(from),length=delta.length();
      if(length>1e-6)segments.push({from,to,delta,length,frame:f});
    }
    const trailMaterial=material('#ffffff');
    trailMaterial.transparent=true;trailMaterial.depthWrite=false;
    trailMaterial.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float historyFrame;\nvarying float trailAge;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntrailAge = historyFrame;');
      shader.fragmentShader='uniform float playbackFrame;\nuniform float historyFrames;\nvarying float trailAge;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat age = playbackFrame - trailAge;\nif (age < 0.0 || age >= historyFrames) discard;\ndiffuseColor.a *= 1.0 - age / historyFrames;');
      shader.uniforms.playbackFrame={value:frame};
      shader.uniforms.historyFrames={value:Math.max(1,(end-start+1)*.3)};
      trailMaterial.userData.shader=shader;
    };
    for(const [items,geometry,isSegment] of [[segments,trailCylinder,true],[samples,trailSphere,false]]) {
      if(!items.length)continue;
      const instanceGeometry=geometry.clone();
      instanceGeometry.setAttribute('historyFrame',new THREE.InstancedBufferAttribute(new Float32Array(items.map(item=>item.frame)),1));
      const mesh=new THREE.InstancedMesh(instanceGeometry,trailMaterial,items.length);
      items.forEach((item,i)=>{
        transform.position.copy(isSegment?item.from.clone().add(item.to).multiplyScalar(.5):item.point);
        transform.quaternion.identity();transform.scale.set(1,1,1);
        if(isSegment){transform.quaternion.setFromUnitVectors(axis,item.delta.clone().normalize());transform.scale.set(.006,item.length,.006);}
        transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
        const relativeSpeed=peakSpeed>0?speeds.get(name)[item.frame]/peakSpeed:0;
        mesh.setColorAt(i,new THREE.Color().setHSL((1-relativeSpeed)*2/3,1,.5));
      });
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
      mesh.receiveShadow=true;scene.add(mesh);
      trails.push({mesh,frames:items.map(item=>item.frame)});
    }
  });
  // Stack sampled historical clubs as playback advances, keeping the current
  // club prominent. Sample in time to avoid a dense wall of overlapping shafts.
  const clubHistory=[];
  const historyStride=Math.max(1,Math.round(fps*.1));
  const historyWindow=Math.max(1,(end-start+1)*.3);
  const clubSpeeds=speeds.get('golf_club_head') || speeds.get(joints[0]);
  for(let f=start;f<=end;f+=historyStride){
    const segments=[];
    for(const [a,b] of [[17,19],[19,20]]){
      if(!valid(frames[f]?.[a])||!valid(frames[f]?.[b]))continue;
      const from=vector(frames[f][a]),to=vector(frames[f][b]),delta=to.clone().sub(from),length=delta.length();
      if(length>1e-6)segments.push({from,to,delta,length});
    }
    if(!segments.length)continue;
    const relativeSpeed=peakSpeed>0&&clubSpeeds?clubSpeeds[f]/peakSpeed:0;
    const historyMaterial=material(new THREE.Color().setHSL((1-relativeSpeed)*2/3,1,.5));
    historyMaterial.transparent=true;historyMaterial.depthWrite=false;
    const mesh=new THREE.InstancedMesh(trailCylinder,historyMaterial,segments.length);
    segments.forEach((item,i)=>{
      transform.position.copy(item.from).add(item.to).multiplyScalar(.5);
      transform.quaternion.setFromUnitVectors(axis,item.delta.clone().normalize());
      transform.scale.set(.0035,item.length,.0035);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
    // Fading history receives light, but does not cast opaque shadows.
    mesh.receiveShadow=true;scene.add(mesh);clubHistory.push({mesh,frame:f});
  }
  const floorPosition = vector([groundX,groundY+jointRadius*unit,groundZ]);
  const floorSize = 2*extent/unit;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(floorSize,.025,floorSize),new THREE.MeshStandardMaterial({color:'#e2eadf',roughness:.95}));
  floor.position.copy(floorPosition);floor.position.y-=.0125;floor.receiveShadow=true;scene.add(floor);
  // Keep exact grid spacing while clipping lines to the exact ground size.
  const half = floorSize/2, step = gridStep/unit, gridPoints = [];
  for(let i=-Math.floor(half/step);i<=Math.floor(half/step);i++) {
    const offset=i*step;
    gridPoints.push(offset,0,-half,offset,0,half,-half,0,offset,half,0,offset);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position',new THREE.Float32BufferAttribute(gridPoints,3));
  const grid = new THREE.LineSegments(gridGeometry,new THREE.LineBasicMaterial({color:'#c5d1c0'}));
  grid.position.copy(floorPosition);grid.position.y+=.001;scene.add(grid);
  // Notebook convention: world = R * camera + t; t is the camera center.
  // Camera models are decorative scene objects, never part of the orbit target.
  const cameraObjects = new THREE.Group(); scene.add(cameraObjects);
  let cameraBound = bound;
  for(const [view,cal] of Object.entries(showCameras ? calibration || {} : {})) {
    const {R,t}=cal;
    if(!Array.isArray(R)||R.length!==3||!R.every(row=>valid(row))||!valid(t))continue;
    const cameraToWorld = v => R.map(row=>row.reduce((sum,value,j)=>sum+value*v[j],0));
    const worldPosition=t;
    const position=vector(worldPosition);
    cameraBound=Math.max(cameraBound,position.length()+.25);
    const direction = v => {const p=cameraToWorld(v);return new THREE.Vector3(p[0],-p[1],-p[2]);};
    const right=direction([1,0,0]),up=direction([0,-1,0]),back=direction([0,0,-1]);
    const group=new THREE.Group();group.position.copy(position);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,back));
    cameraObjects.add(group);
    const color=view==='face-on'?'#ef4444':'#ffc65b';
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.065,24,16),material(color));
    marker.castShadow=marker.receiveShadow=true;group.add(marker);
    // Visualize the actual optical axis, not a look-at aimed at the golfer.
    const forward=direction([0,0,1]).normalize();
    const distanceToBody=position.length();
    const depth=Math.max(.6,distanceToBody*.65);
    const K=cal.intrinsic;
    const sx=K?.[0]?.[0]>0?Math.min(.7,K[0][2]/K[0][0]):.35;
    const sy=K?.[1]?.[1]>0?Math.min(.7,K[1][2]/K[1][1]):.35;
    const corners=[[-sx,-sy],[sx,-sy],[sx,sy],[-sx,sy]].map(([x,y])=>new THREE.Vector3(x*depth,y*depth,-depth));
    const segments=[];
    for(let i=0;i<4;i++){segments.push(0,0,0,...corners[i].toArray(),...corners[i].toArray(),...corners[(i+1)%4].toArray());}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
    group.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#78a84a',transparent:true,opacity:.8})));
    const arrow=new THREE.ArrowHelper(forward,position,depth,'#78a84a',.1,.045);
    cameraObjects.add(arrow);
    for(const corner of corners){
      const world=corner.clone().applyQuaternion(group.quaternion).add(position);
      cameraBound=Math.max(cameraBound,world.length()+.15);
    }
    const labelCanvas=document.createElement('canvas');labelCanvas.width=384;labelCanvas.height=80;
    const context=labelCanvas.getContext('2d');context.fillStyle='#f4f7f0';context.fillRect(0,0,384,80);context.fillStyle=color;context.font='500 34px sans-serif';context.textAlign='center';context.fillText(view==='face-on'?'Face-on camera':'Down-the-line camera',192,52);
    const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;
    const caption=new THREE.Sprite(new THREE.SpriteMaterial({map:texture}));caption.position.copy(position).add(new THREE.Vector3(0,.17,0));caption.scale.set(.52,.108,1);cameraObjects.add(caption);
  }
  function draw() {
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.zoom=zoom;
    // Fit the complete motion using the narrower viewport angle.
    const verticalHalfFov=THREE.MathUtils.degToRad(camera.fov/2);
    const halfFov=Math.min(verticalHalfFov,Math.atan(Math.tan(verticalHalfFov)*camera.aspect));
    const distance=bound*distanceScale/(Math.sin(halfFov)*.84);
    camera.far=Math.max(100,distance+bound*5);
    camera.position.set(distance*Math.sin(yaw)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(yaw)*Math.cos(pitch));
    camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
    const pose=frames[frame];
    for(const {a,b,mesh} of bones){
      mesh.visible=valid(pose[a])&&valid(pose[b]);if(!mesh.visible)continue;
      const from=vector(pose[a]),to=vector(pose[b]),delta=to.clone().sub(from),length=delta.length();
      mesh.visible=length>1e-8;if(!mesh.visible)continue;
      mesh.position.copy(from).add(to).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(axis,delta.normalize());mesh.scale.set(boneRadius,length,boneRadius);
    }
    dots.forEach((mesh,i)=>{if(!mesh)return;mesh.visible=valid(pose[i]);if(mesh.visible)mesh.position.copy(vector(pose[i]));});
    for(const trail of trails){
      let low=0,high=trail.frames.length;
      while(low<high){const middle=(low+high)>>>1;if(trail.frames[middle]<=frame)low=middle+1;else high=middle;}
      trail.mesh.count=low;
      const shader=trail.mesh.material.userData.shader;
      if(shader)shader.uniforms.playbackFrame.value=frame;
    }
    for(const past of clubHistory){
      const age=frame-past.frame;
      past.mesh.visible=age>0&&age<historyWindow;
      if(past.mesh.visible)past.mesh.material.opacity=.75*(1-age/historyWindow);
    }
    renderer.render(scene,camera);
  }
  const pointers=new Map();
  const clampZoom=value=>Math.max(.4,Math.min(4,value));
  const pinchDistance=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
  canvas.onpointerdown=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove=e=>{
    const previous=pointers.get(e.pointerId);if(!previous)return;
    const before=pointers.size===2?pinchDistance():0;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){const after=pinchDistance();if(before>0)zoom=clampZoom(zoom*after/before);}
    else if(pointers.size===1){yaw-=(e.clientX-previous.x)*.01;pitch=Math.max(-1.4,Math.min(1.4,pitch+(e.clientY-previous.y)*.01));}
    draw();
  };
  const release=e=>pointers.delete(e.pointerId);
  canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=release;
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    // Trackpad pinch arrives as a Ctrl+wheel gesture in supporting browsers.
    zoom=clampZoom(zoom*Math.exp(-e.deltaY*(e.ctrlKey ? .01 : .001)));draw();
  },{passive:false});
  new ResizeObserver(draw).observe(canvas); draw();
  // Loop the selected motion at its recorded frame rate. Only the current,
  // visible carousel card renders; hidden cards retain their playback position.
  const frameCount = end-start+1;
  let elapsedFrames = frame-start, previousTime;
  let inViewport = false;
  const visibility = new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting;});
  visibility.observe(canvas);
  function animate(now) {
    if(!canvas.isConnected){visibility.disconnect();return;}
    const playing = inViewport && !document.hidden && !card.inert;
    if(playing && previousTime !== undefined) {
      elapsedFrames = (elapsedFrames+(now-previousTime)*fps/1000)%frameCount;
      const nextFrame = start+Math.floor(elapsedFrames);
      if(nextFrame!==frame){frame=nextFrame;draw();}
    }
    previousTime=playing?now:undefined;
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
