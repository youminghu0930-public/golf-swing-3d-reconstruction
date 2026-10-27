import fs from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const content = JSON.parse(await fs.readFile(new URL('materials/content.json', root), 'utf8'));
const expected = ['abstract', 'introduction', 'method', 'results', 'discussion', 'conclusion'];
if (JSON.stringify(content.sections.map(section => section.id)) !== JSON.stringify(expected)) throw new Error('Expected the six project sections in order.');
await fs.mkdir(new URL('dist/materials/', root), {recursive: true});
for (const file of ['index.html', 'styles.css', 'main.js', 'snapshot-3d.js', '.nojekyll', 'materials/content.json']) {
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
