import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {discoverVideoCatalog} from '../scripts/video-catalog.mjs';
test('source deletions remove entries even if generated previews and stale manifests remain',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'golf-catalog-'));
  try{
    for(const folder of ['videos/01','2d_dections/01','3d_results','previews/01'])fs.mkdirSync(path.join(root,'materials/data',folder),{recursive:true});
    for(const view of ['face-on','down-the-line']){
      fs.writeFileSync(path.join(root,`materials/data/videos/01/${view}.MP4`),'source');
      fs.writeFileSync(path.join(root,`materials/data/2d_dections/01/${view}.json`),'{}');
      fs.writeFileSync(path.join(root,`materials/data/previews/01/${view}.mp4`),'cached');
    }
    fs.writeFileSync(path.join(root,'materials/data/3d_results/01.json'),JSON.stringify({reconstruction:[[],[],[]]}));
    fs.writeFileSync(path.join(root,'materials/data/videos.json'),JSON.stringify([{id:'deleted'}]));
    const options={probe:()=>({fps:30,frames:3})};
    assert.deepEqual(discoverVideoCatalog(root,options).map(c=>c.id),['01']);
    fs.unlinkSync(path.join(root,'materials/data/videos/01/down-the-line.MP4'));
    assert.deepEqual(discoverVideoCatalog(root,options),[]);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
