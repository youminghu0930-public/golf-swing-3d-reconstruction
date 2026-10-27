import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {discoverVideoCatalog} from './video-catalog.mjs';
export function prepareVideos(root=fileURLToPath(new URL('../',import.meta.url))){
const catalog=discoverVideoCatalog(root);
fs.writeFileSync(path.join(root,'materials/data/videos.json'),JSON.stringify(catalog,null,2)+'\n');
for(const clip of catalog)for(const view of clip.views){
  const source=path.join(root,view.source),target=path.join(root,view.src);
  const saveTimes=()=>{
    const output=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',target],{encoding:'utf8',maxBuffer:20*1024*1024});
    if(output.status!==0)throw new Error(`Could not read frame timestamps: ${target}`);
    const times=JSON.parse(output.stdout).frames.map(frame=>Number(frame.best_effort_timestamp_time));
    if(times.length!==view.frames||times.some((time,i)=>!Number.isFinite(time)||(i>0&&time<=times[i-1])))throw new Error(`Invalid frame timestamps: ${target}`);
    fs.writeFileSync(target+'.frames.json',JSON.stringify(times));
  };
  if(fs.existsSync(target)&&fs.statSync(target).mtimeMs>=fs.statSync(source).mtimeMs){if(!fs.existsSync(target+'.frames.json'))saveTimes();continue;}
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const temporary=target+'.tmp.mp4';
  const result=spawnSync('ffmpeg',['-y','-v','error','-i',source,'-map','0:v:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-fps_mode','passthrough','-movflags','+faststart',temporary],{stdio:'inherit'});
  if(result.error||result.status!==0)throw new Error(`Could not prepare ${view.source}. Install ffmpeg. ${result.error?.message||''}`);
  fs.renameSync(temporary,target);saveTimes();
  console.log(`Prepared ${view.src}`);
}

return catalog;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))prepareVideos();
