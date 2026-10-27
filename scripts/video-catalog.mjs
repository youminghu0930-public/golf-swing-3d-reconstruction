import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
export function probeVideo(file){
  const result=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=r_frame_rate,nb_frames','-of','json',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Could not inspect ${file}`);
  const stream=JSON.parse(result.stdout).streams[0], [n,d]=stream.r_frame_rate.split('/').map(Number);
  return {fps:n/d,frames:Number(stream.nb_frames)};
}
export function discoverVideoCatalog(root,{probe=probeVideo}={}){
  const folder=path.join(root,'materials/data/videos');
  if(!fs.existsSync(folder))return [];
  const clips=[];
  for(const item of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(!item.isDirectory()||! /^[\w-]+$/.test(item.name))continue;
    const id=item.name,result=path.join(root,`materials/data/3d_results/${id}.json`);
    if(!fs.existsSync(result))continue;
    const files=fs.readdirSync(path.join(folder,id)),views=[];
    for(const name of ['face-on','down-the-line']){
      const file=files.find(file=>file.toLowerCase()===name+'.mp4');
      if(!file||!fs.existsSync(path.join(root,`materials/data/2d_dections/${id}/${name}.json`)))break;
      const source=`materials/data/videos/${id}/${file}`,metadata=probe(path.join(root,source));
      views.push({name,src:`materials/data/previews/${id}/${name}.mp4`,...metadata,source});
    }
    if(views.length!==2)continue;
    const reconstruction=JSON.parse(fs.readFileSync(result,'utf8')).reconstruction;
    clips.push({id,name:`Swing ${id}`,frames:Math.min(reconstruction.length,...views.map(v=>v.frames)),views});
  }
  return clips;
}
