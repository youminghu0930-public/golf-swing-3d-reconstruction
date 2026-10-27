import {createFrameSeeker} from './frame-seeker.js';
import {installFrameKeys} from './frame-keys.js';
import {mountPoseScene} from './snapshot-3d.js';
const make=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
async function json(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`${url}: ${response.status}`);return response.json();}
function playbackIcon(button, key) {
  const paths = {
    start: 'M3 4v16M12 6 5 12l7 6ZM21 6l-7 6 7 6Z',
    previous: 'M6 4v16M18 5 8 12l10 7Z',
    play: 'm8 5 11 7-11 7Z',
    stop: 'M6 6h12v12H6Z',
    next: 'M18 4v16M6 5l10 7-10 7Z',
    end: 'M21 4v16M3 6l7 6-7 6ZM12 6l7 6-7 6Z',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[key]); svg.append(path); button.replaceChildren(svg);
}
function setPlaybackButton(button,playing){
  playbackIcon(button,playing?'stop':'play');
  button.title=playing?'Stop':'Play';button.setAttribute('aria-label',button.title);
}
export async function mountVideos(root){
  root.append(make('h3','Videos','result-subheading media-heading'));
  const shell=make('div',undefined,'video-workspace');
  const player=make('div',undefined,'reconstruction-player comparison-player'),sidebar=make('aside',undefined,'video-sidebar');
  player.tabIndex=0;player.setAttribute('aria-label','Video reconstruction player');
  sidebar.append(make('h4','Swing videos'));
  const list=make('div',undefined,'video-name-list');list.append(make('p','Loading video list…','section-note'));sidebar.append(list);shell.append(player,sidebar);root.append(shell);
  const placeholder=make('div',undefined,'video-pose');placeholder.setAttribute('aria-busy','true');player.append(placeholder);
  const [catalog,credits]=await Promise.all([json('materials/data/videos.json'),json('materials/data/credit.json')]);
  let controller,media=[],version=0,frame=0,playing=false,raf,videoCallback,callbackVideo,selectionAbort,seekers=[],shortcutReady=false,shortcutStep,shortcutToggle;
  let activeView='free-view';
  const playerHeading=make('h4',undefined,'media-item-title'),content=make('div',undefined,'video-player-content');
  const viewOptions=make('div',undefined,'camera-view-options');viewOptions.setAttribute('role','group');viewOptions.setAttribute('aria-label','Camera view');
  const viewButtons=[];
  for(const [value,label] of [['face-on','Face-on view'],['down-the-line','Down-the-line view'],['free-view','Free-view']]){
    const button=make('button',label);button.type='button';button.setAttribute('aria-pressed',String(value===activeView));
    button.onclick=()=>{activeView=value;controller?.setView(value);if(value!=='free-view'){const distance=content.querySelector('[aria-label="Camera distance"]');if(distance){distance.value=String(Math.log(1/.4)/Math.log(3/.4));distance.setAttribute('aria-valuetext','1.00× camera distance');}}viewButtons.forEach(([b,v])=>b.setAttribute('aria-pressed',String(v===value)));};
    viewOptions.append(button);viewButtons.push([button,value]);
  }
  player.replaceChildren(playerHeading,viewOptions,content);
  const frameKeys=installFrameKeys({target:document,blurTarget:window,isReady:()=>shortcutReady,step:delta=>shortcutStep?.(delta),toggle:()=>shortcutToggle?.()});
  const buttons=[];
  function stop(){playing=false;cancelAnimationFrame(raf);if(callbackVideo&&videoCallback!==undefined)callbackVideo.cancelVideoFrameCallback(videoCallback);videoCallback=undefined;media.forEach(video=>{video.pause();video.playbackRate=1;});}
  let selectedId,refreshing=false;
  function renderList(){
    list.replaceChildren();buttons.length=0;
    catalog.forEach((clip,i)=>{
      const button=make('button',clip.name);button.type='button';button.setAttribute('aria-pressed',String(clip.id===selectedId));button.onclick=()=>select(clip,i);list.append(button);buttons.push(button);
    });
  }
  renderList();
  async function refreshCatalog(){
    if(refreshing||document.hidden)return;refreshing=true;
    try{
      const next=await json('materials/data/videos.json');
      if(JSON.stringify(next)===JSON.stringify(catalog))return;
      catalog.splice(0,catalog.length,...next);renderList();
      if(!catalog.some(clip=>clip.id===selectedId)){
        if(catalog.length)await select(catalog[0],0);
        else{++version;shortcutReady=false;stop();selectionAbort?.abort();controller?.dispose();controller=undefined;content.replaceChildren(make('p','No videos available.'));playerHeading.textContent='';}
      }
    }catch(error){console.warn('Video list refresh failed',error);}finally{refreshing=false;}
  }
  window.addEventListener('focus',refreshCatalog);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCatalog();});
  async function select(clip,index){
    selectedId=clip.id;
    const request=++version;shortcutReady=false;frameKeys.clear();seekers.forEach(seeker=>seeker.reset());seekers=[];selectionAbort?.abort();selectionAbort=new AbortController();const signal=selectionAbort.signal;stop();controller?.dispose();controller=undefined;media.forEach(v=>{v.removeAttribute('src');v.load();});media=[];
    frame=0;buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
    playerHeading.textContent=clip.name;content.replaceChildren();
    const views=make('div',undefined,'video-source-decoders');
    const pose=make('article',undefined,'video-pose');
    const distanceControl=make('label',undefined,'camera-distance-control');
    const distanceLabel=make('span','Distance');
    const distanceSlider=make('input');distanceSlider.type='range';distanceSlider.min='0';distanceSlider.max='1';distanceSlider.step='.001';distanceSlider.value=String(Math.log(1/.4)/Math.log(3/.4));distanceSlider.disabled=true;
    distanceSlider.setAttribute('aria-label','Camera distance');distanceSlider.title='Camera distance';
    const updateDistance=()=>{
      const distance=.4*Math.pow(3/.4,Number(distanceSlider.value));
      distanceSlider.setAttribute('aria-valuetext',`${distance.toFixed(2)}× camera distance`);
      controller?.setDistance(distance);
    };
    distanceSlider.setAttribute('aria-valuetext','1.00× camera distance');
    distanceSlider.oninput=updateDistance;
    distanceControl.append(distanceLabel,distanceSlider);pose.append(distanceControl);
    const status=make('p','Loading reconstruction…','section-note');status.setAttribute('role','status');
    for(const view of clip.views){
      const panel=make('div');
      const video=make('video');video.src=view.src;video.preload='auto';video.muted=true;video.playsInline=true;video.setAttribute('aria-hidden','true');video.tabIndex=-1;panel.append(video);views.append(panel);media.push(video);

    }
    const controls=make('div',undefined,'playback-controls');
    const playback={};
    for(const [key,label] of [['start','Jump to start'],['previous','Previous frame'],['play','Play'],['next','Next frame'],['end','Jump to end']]){
      const button=make('button');button.type='button';button.title=label;button.setAttribute('aria-label',label);button.disabled=true;playbackIcon(button,key);controls.append(button);playback[key]=button;
    }
    controls.addEventListener('click',event=>{if(event.detail>0)player.focus({preventScroll:true});});
    const {start,previous,play,next,end}=playback;
    const slider=make('input',undefined,'frame-slider');slider.type='range';slider.min=0;slider.max=clip.frames-1;slider.value=0;slider.setAttribute('aria-label','Video frame');slider.disabled=true;
    const meta=make('div',undefined,'player-meta');
    const counter=make('output',`Frame 1 / ${clip.frames}`);meta.append(counter,status);
    content.append(views,pose,slider,meta,controls,make('p','Press Space to play or pause. Tap ← / → to step one frame; hold to repeat.','keyboard-hint'));
    const creditValue=credits[clip.id]??credits[clip.id.split('-')[0]];
    if(creditValue){
      try{
        const url=new URL(typeof creditValue==='string'?creditValue:creditValue.url);
        if(['http:','https:'].includes(url.protocol)){
          const credit=make('div',undefined,'video-credit'),line=make('p'),link=make('a','Original video on YouTube ↗');
          link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
          line.append(make('span','Video source: '),link);credit.append(line);content.append(credit);
        }
      }catch(error){console.warn('Invalid video credit URL',error);}
    }
    let readyController;
    const sources=[...media],startedAt=performance.now();
    let reconstructionReady=false;
    const updateStatus=()=>{
      if(request!==version)return;
      if(!reconstructionReady){status.textContent=performance.now()-startedAt>20000?'Still loading the 3D reconstruction… This is taking longer than usual.':'Loading reconstruction…';return;}
      const pending=sources.map((video,i)=>{
        const name=clip.views[i].name==='face-on'?'Face-on':'Down-the-line';
        if(video.error)return `${name}: failed to load`;
        if(video.readyState>=2&&!video.seeking&&!video.paused)return '';
        if(video.readyState>=2&&!playing)return '';
        const buffered=video.buffered.length?video.buffered.end(video.buffered.length-1):0;
        const percent=Number.isFinite(video.duration)&&video.duration>0?Math.round(buffered/video.duration*100):0;
        return `${name}: ${video.readyState>=2?'buffering':'loading'}${percent?` ${percent}%`:''}`;
      }).filter(Boolean);
      status.textContent=pending.length?`${pending.join(' · ')}. 3D controls remain available.${performance.now()-startedAt>20000?' Video is taking longer than usual; you can keep exploring the 3D view.':''}`:'';
    };
    const statusTimer=setInterval(updateStatus,1000);
    signal.addEventListener('abort',()=>clearInterval(statusTimer),{once:true});
    for(const video of sources)for(const event of ['progress','loadeddata','waiting','playing','error','stalled'])video.addEventListener(event,updateStatus,{signal});
    try{const rawDetections=Object.fromEntries(await Promise.all(clip.views.map(async view=>[view.name,await json(`materials/data/2d_dections/${clip.id}/${view.name}.json`)])));
      if(request!==version)return;
      readyController=await mountPoseScene(pose,clip.id,{range:[0,clip.frames-1],fps:clip.views[0].fps,joints:['golf_club_head']},{showCameras:true,autoPlay:false,rawDetections,cameraVideos:Object.fromEntries(clip.views.map((view,i)=>[view.name,media[i]]))});}
    catch(error){if(request===version){console.error(error);clearInterval(statusTimer);status.textContent='The reconstruction could not be loaded. Select another swing or reload to retry.';}return;}
    if(request!==version){readyController.dispose();return;}controller=readyController;reconstructionReady=true;controller.setView(activeView,{animate:false});
    distanceSlider.disabled=false;
    const times=clip.views.map(view=>Array.from({length:clip.frames},(_,i)=>i/view.fps));
    // Exact timestamps improve decoding, but never gate the reconstruction UI.
    clip.views.forEach((view,i)=>json(view.src+'.frames.json').then(value=>{if(request===version)times[i]=value;}).catch(()=>{}));
    let requestedFrame=0;
    const settled=media.map(()=>-1);
    seekers=media.map((video,i)=>createFrameSeeker(video,{
      getTimes:()=>times[i],onRequest:()=>{},
      onSettled:index=>{
        settled[i]=index;
        if(request===version&&settled.every(value=>value===requestedFrame)){
          updateStatus();
        }
      }
    }));
    function updateLabel(index){slider.value=index;counter.textContent=`Frame ${index+1} / ${clip.frames}`;slider.setAttribute('aria-valuetext',counter.textContent);}
    const fps=clip.views[0].fps;
    function showFrame(value,seek=true){
      const target=Math.max(0,Math.min(clip.frames-1,Math.floor(value)));
      if(seek){requestedFrame=target;frame=target;controller.setFrame(target);updateLabel(target);updateStatus();seekers.forEach((seeker,i)=>{if(sources[i].readyState>=2)seeker.request(target);});}
      else{requestedFrame=target;if(frame!==target){frame=target;controller.setFrame(frame);}updateLabel(frame);}
    }
    function pause(){stop();setPlaybackButton(play,false);}
    let clockStart=0,clockFrame=0;
    const baseRate=clip.views[0].fps/clip.views[1].fps;
    function startSource(video,i){
      if(request!==version||video.readyState<2)return;
      const target=times[i][frame]??frame/clip.views[i].fps;
      if(!video.seeking&&Math.abs(video.currentTime-target)>.15)video.currentTime=target;
      if(playing){video.playbackRate=i?baseRate:1;video.play().catch(()=>{if(request===version){status.textContent='Video playback is unavailable. The 3D animation continues; tap Play to retry.';}});}
      else seekers[i].request(frame);
    }
    sources.forEach((video,i)=>video.addEventListener('loadeddata',()=>startSource(video,i),{signal}));
    function tick(now){
      if(!playing||request!==version)return;
      const target=clockFrame+(now-clockStart)*fps/1000;
      showFrame(Math.min(clip.frames-1,target),false);
      sources.forEach((video,i)=>{
        if(video.readyState<2||video.seeking)return;
        const drift=(times[i][frame]??frame/clip.views[i].fps)-video.currentTime;
        if(Math.abs(drift)>.25)video.currentTime=times[i][frame];
        else video.playbackRate=(i?baseRate:1)*Math.max(.97,Math.min(1.03,1+drift*.3));
      });
      if(target>=clip.frames-1){pause();return;}
      raf=requestAnimationFrame(tick);
    }
    const togglePlayback=()=>{
      if(playing){pause();updateStatus();return;}
      if(frame>=clip.frames-1)showFrame(0);
      seekers.forEach(seeker=>seeker.reset());
      playing=true;clockFrame=frame;clockStart=performance.now();setPlaybackButton(play,true);
      sources.forEach(startSource);updateStatus();raf=requestAnimationFrame(tick);
    };
    play.onclick=togglePlayback;
    start.onclick=()=>{pause();showFrame(0);};end.onclick=()=>{pause();showFrame(clip.frames-1);};
    previous.onclick=()=>{pause();showFrame(requestedFrame-1);};next.onclick=()=>{pause();showFrame(requestedFrame+1);};slider.oninput=()=>{pause();showFrame(Number(slider.value));};
    media.forEach((video,i)=>video.addEventListener('loadedmetadata',()=>{if(request===version)video.currentTime=frame/clip.views[i].fps;}));
    shortcutStep=delta=>{player.focus({preventScroll:true});pause();showFrame(requestedFrame+delta);};shortcutToggle=()=>{player.focus({preventScroll:true});togglePlayback();};shortcutReady=true;
    distanceSlider.disabled=false;
    for(const [button] of viewButtons)button.disabled=false;
    for(const button of Object.values(playback))button.disabled=false;slider.disabled=false;showFrame(0);updateStatus();
  }
  if(catalog.length)await select(catalog[0],0);else player.textContent='No videos available.';
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();const button=player.querySelector('.playback-controls button:nth-child(3)');if(button)setPlaybackButton(button,false);}});
}
