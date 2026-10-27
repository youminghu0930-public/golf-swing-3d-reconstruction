import {createFrameSeeker} from './frame-seeker.js';
import {installFrameKeys} from './frame-keys.js';
import {frameAtTime} from './frame-timing.js';
import {mountPoseScene} from './snapshot-3d.js';
const make=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
async function json(url){const response=await fetch(url);if(!response.ok)throw new Error(`${url}: ${response.status}`);return response.json();}
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
function waitForVideo(video,signal){
  if(video.readyState>=2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{video.removeEventListener('loadeddata',ready);video.removeEventListener('error',error);signal.removeEventListener('abort',abort);};
    const ready=()=>{cleanup();resolve();},error=()=>{cleanup();reject(new Error('Video could not load.'));},abort=()=>{cleanup();reject(new DOMException('Selection changed','AbortError'));};
    if(signal.aborted){abort();return;}
    video.addEventListener('loadeddata',ready);video.addEventListener('error',error);signal.addEventListener('abort',abort,{once:true});
  });
}
export async function mountVideos(root){
  const [catalog,credits]=await Promise.all([json('materials/data/videos.json'),json('materials/data/credit.json')]);
  root.append(make('h3','Videos','result-subheading media-heading'));
  const shell=make('div',undefined,'video-workspace');
  const player=make('div',undefined,'reconstruction-player comparison-player'),sidebar=make('aside',undefined,'video-sidebar');
  player.tabIndex=0;player.setAttribute('aria-label','Video reconstruction player');
  sidebar.append(make('h4','Swing videos'));
  const list=make('div',undefined,'video-name-list');sidebar.append(list);shell.append(player,sidebar);root.append(shell);
  let controller,media=[],version=0,frame=0,playing=false,raf,videoCallback,callbackVideo,selectionAbort,seekers=[],shortcutReady=false,shortcutStep,shortcutToggle;
  let activeView='free-view';
  const playerHeading=make('h4',undefined,'media-item-title'),content=make('div',undefined,'video-player-content');
  const viewOptions=make('div',undefined,'camera-view-options');viewOptions.setAttribute('role','group');viewOptions.setAttribute('aria-label','Camera view');
  const viewButtons=[];
  for(const [value,label] of [['face-on','Face-on view'],['down-the-line','Down-the-line view'],['free-view','Free-view']]){
    const button=make('button',label);button.type='button';button.setAttribute('aria-pressed',String(value===activeView));
    button.onclick=()=>{activeView=value;controller?.setView(value);viewButtons.forEach(([b,v])=>b.setAttribute('aria-pressed',String(v===value)));};
    viewOptions.append(button);viewButtons.push([button,value]);
  }
  player.append(playerHeading,viewOptions,content);
  const frameKeys=installFrameKeys({target:document,blurTarget:window,isReady:()=>shortcutReady,step:delta=>shortcutStep?.(delta),toggle:()=>shortcutToggle?.()});
  const buttons=[];
  function stop(){playing=false;cancelAnimationFrame(raf);if(callbackVideo&&videoCallback!==undefined)callbackVideo.cancelVideoFrameCallback(videoCallback);videoCallback=undefined;media.forEach(video=>{video.pause();video.playbackRate=1;});}
  catalog.forEach((clip,i)=>{
    const button=make('button',clip.name);button.type='button';button.setAttribute('aria-pressed','false');button.onclick=()=>select(clip,i);list.append(button);buttons.push(button);
  });
  async function select(clip,index){
    const request=++version;shortcutReady=false;frameKeys.clear();seekers.forEach(seeker=>seeker.reset());seekers=[];selectionAbort?.abort();selectionAbort=new AbortController();const signal=selectionAbort.signal;stop();controller?.dispose();controller=undefined;media.forEach(v=>{v.removeAttribute('src');v.load();});media=[];
    frame=0;buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
    playerHeading.textContent=clip.name;content.replaceChildren();
    const views=make('div',undefined,'video-source-decoders');
    const pose=make('article',undefined,'video-pose');
    const status=make('p','Loading reconstruction…','section-note');status.setAttribute('role','status');
    for(const view of clip.views){
      const panel=make('div');
      const video=make('video');video.src=view.src;video.preload='auto';video.muted=true;video.playsInline=true;video.setAttribute('aria-hidden','true');video.tabIndex=-1;panel.append(video);views.append(panel);media.push(video);
      video.addEventListener('error',()=>{status.textContent='A source video could not be loaded.';});
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
    const firstFrames=Promise.all(media.map(video=>waitForVideo(video,signal)));firstFrames.catch(()=>{});
    try{const rawDetections=Object.fromEntries(await Promise.all(clip.views.map(async view=>[view.name,await json(`materials/data/2d_dections/${clip.id}/${view.name}.json`)])));
      if(request!==version)return;
      readyController=await mountPoseScene(pose,clip.id,{range:[0,clip.frames-1],fps:clip.views[0].fps,joints:['golf_club_head']},{showCameras:true,autoPlay:false,rawDetections,cameraVideos:Object.fromEntries(clip.views.map((view,i)=>[view.name,media[i]]))});}
    catch(error){if(request===version){console.error(error);status.textContent='The reconstruction could not be loaded.';}return;}
    if(request!==version){readyController.dispose();return;}controller=readyController;controller.setView(activeView,{animate:false});
    status.textContent='Loading video frames…';
    try{await firstFrames;}catch(error){if(request===version&&error.name!=='AbortError')status.textContent='A source video could not be loaded.';return;}
    if(request!==version)return;
    const times=await Promise.all(clip.views.map(view=>json(view.src+'.frames.json')));
    if(request!==version)return;
    let requestedFrame=0;
    const settled=media.map(()=>-1);
    seekers=media.map((video,i)=>createFrameSeeker(video,{
      getTimes:()=>times[i],onRequest:()=>{},
      onSettled:index=>{
        settled[i]=index;
        if(request===version&&settled.every(value=>value===requestedFrame)){
          frame=requestedFrame;updateLabel(frame);status.textContent='';
        }
      }
    }));
    function updateLabel(index){slider.value=index;counter.textContent=`Frame ${index+1} / ${clip.frames}`;slider.setAttribute('aria-valuetext',counter.textContent);}
    const fps=clip.views[0].fps;
    function showFrame(value,seek=true){
      const target=Math.max(0,Math.min(clip.frames-1,Math.floor(value)));
      if(seek){requestedFrame=target;frame=target;controller.setFrame(target);updateLabel(target);status.textContent='';seekers.forEach(seeker=>seeker.request(target));}
      else{requestedFrame=target;if(frame!==target){frame=target;controller.setFrame(frame);}updateLabel(frame);}
    }
    function pause(){stop();setPlaybackButton(play,false);}
    const baseRate=clip.views[0].fps/clip.views[1].fps;
    function schedule(){
      if(!playing)return;
      if(media[0].requestVideoFrameCallback){callbackVideo=media[0];videoCallback=media[0].requestVideoFrameCallback(tick);}
      else raf=requestAnimationFrame(()=>tick());
    }
    function tick(now,metadata){
      if(!playing||request!==version)return;
      const time=metadata?.mediaTime??media[0].currentTime;
      showFrame(frameAtTime(times[0],time),false);
      const other=media[1],targetTime=times[1][frame]+Math.max(0,time-times[0][frame]),drift=targetTime-other.currentTime;
      // Correct small drift by rate, avoiding repeated decoder seeks.
      if(other.readyState>=2&&!other.seeking){
        if(Math.abs(drift)>.5)other.currentTime=targetTime;
        else other.playbackRate=baseRate*Math.max(.97,Math.min(1.03,1+drift*.3));
      }
      if(media[0].ended){pause();return;}schedule();
    }
    media[0].addEventListener('ended',()=>{if(request===version)pause();});
    const togglePlayback=async()=>{
      if(playing){pause();return;}
      if(frame>=clip.frames-1)showFrame(0);
      try{
        status.textContent='Starting playback…';await Promise.all(seekers.map(seeker=>seeker.whenIdle()));if(request!==version)return;media[1].playbackRate=baseRate;
        await Promise.all(media.map(v=>v.play()));if(request!==version)return;
        playing=true;setPlaybackButton(play,true);status.textContent='';schedule();
      }
      catch(error){if(request!==version)return;pause();status.textContent='Playback could not start. Try Play again.';}
    };
    play.onclick=togglePlayback;
    start.onclick=()=>{pause();showFrame(0);};end.onclick=()=>{pause();showFrame(clip.frames-1);};
    previous.onclick=()=>{pause();showFrame(requestedFrame-1);};next.onclick=()=>{pause();showFrame(requestedFrame+1);};slider.oninput=()=>{pause();showFrame(Number(slider.value));};
    media.forEach((video,i)=>video.addEventListener('loadedmetadata',()=>{if(request===version)video.currentTime=frame/clip.views[i].fps;}));
    shortcutStep=delta=>{player.focus({preventScroll:true});pause();showFrame(requestedFrame+delta);};shortcutToggle=()=>{player.focus({preventScroll:true});togglePlayback();};shortcutReady=true;
    for(const [button] of viewButtons)button.disabled=false;
    for(const button of Object.values(playback))button.disabled=false;slider.disabled=false;status.textContent='';showFrame(0);
  }
  if(catalog.length)await select(catalog[0],0);else player.textContent='No videos available.';
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();const button=player.querySelector('.playback-controls button:nth-child(3)');if(button)setPlaybackButton(button,false);}});
}
