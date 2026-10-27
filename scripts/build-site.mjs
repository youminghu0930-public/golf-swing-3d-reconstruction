import {prepareVideos} from './prepare-videos.mjs';
prepareVideos();
import fs from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const content = JSON.parse(await fs.readFile(new URL('materials/content.json', root), 'utf8'));
const expected = ['abstract', 'introduction', 'method', 'results', 'discussion', 'conclusion'];
if (JSON.stringify(content.sections.map(section => section.id)) !== JSON.stringify(expected)) throw new Error('Expected the six project sections in order.');
await fs.rm(new URL('dist/',root),{recursive:true,force:true});
await fs.mkdir(new URL('dist/materials/data/', root), {recursive: true});
for (const file of ['index.html', 'styles.css', 'main.js', 'hero-banner.js', 'snapshot-3d.js', 'camera-flight.js', 'frame-seeker.js', 'frame-keys.js', 'frame-timing.js', 'video-viewer.js', '.nojekyll', 'materials/content.json', 'materials/data/credit.json']) {
  await fs.copyFile(new URL(file, root), new URL(`dist/${file}`, root));
}
console.log('Built static page in dist/');

const snapshots = JSON.parse(await fs.readFile(new URL('materials/data/snapshot.json', root), 'utf8'));
await fs.mkdir(new URL('dist/materials/data/3d_results/', root), {recursive:true});
await fs.copyFile(new URL('materials/data/snapshot.json', root), new URL('dist/materials/data/snapshot.json', root));
for (const id of Object.keys(snapshots)) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid swing ID');
  const file = `materials/data/3d_results/${id}.json`;
  await fs.copyFile(new URL(file, root), new URL(`dist/${file}`, root));
}

await fs.cp(new URL('vendor/', root), new URL('dist/vendor/', root), {recursive:true});

const videos=JSON.parse(await fs.readFile(new URL('materials/data/videos.json',root),'utf8'));
await fs.copyFile(new URL('materials/data/videos.json',root),new URL('dist/materials/data/videos.json',root));
for(const video of videos){
  for(const file of [`materials/data/3d_results/${video.id}.json`,...video.views.flatMap(view=>[view.src,view.src+'.frames.json',`materials/data/2d_dections/${video.id}/${view.name}.json`])]){
    await fs.mkdir(new URL(`dist/${file.substring(0,file.lastIndexOf('/')+1)}`,root),{recursive:true});
    await fs.copyFile(new URL(file,root),new URL(`dist/${file}`,root));
  }
}
