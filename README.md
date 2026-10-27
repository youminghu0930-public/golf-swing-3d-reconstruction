# Golf Swing 3D Reconstruction

Static project page using the visual template from `improving-golf-swing-pose-estimation`: system sans-serif typography, sage palette, responsive section layout, and collapsible left navigation.

## Local development

Requires Node.js 22 or later; no dependencies to install.

```sh
node scripts/serve.mjs
```

Open http://127.0.0.1:8006. An optional numeric argument overrides the port.

## Content and materials

- `materials/content.json`: all displayed page copy and the six ordered sections.
- `materials/data/content.json`: existing source material, preserved separately from page copy.
- `materials/data/videos/<id>/`: source video material.
- `materials/data/2d_dections/<id>/`: existing 2D detections (original folder spelling preserved).
- `materials/data/3d_results/`: reconstruction JSON.
- `materials/data/snapshot.json`: existing snapshot metadata.
- `materials/data/credit.json`: video source credits.

Existing IDs, including `00-origainal`, are preserved. The Abstract includes rotatable 3D snapshots with joint trails; videos are deferred. Section text is starter copy, not reported findings.

## Git workflow and deployment

Create a branch for each change, review `git diff`, then commit and push. The GitHub Actions workflow builds and deploys GitHub Pages on pushes to `main` or `master`, or by manual dispatch. In repository Settings → Pages, select GitHub Actions as the source.

```sh
node --check main.js
node --check scripts/serve.mjs
node scripts/build-site.mjs
git diff --check
```

The build validates section order and copies only the page files into ignored `dist/`; only snapshot-selected 3D results and snapshot configuration are included alongside the page. Preview the build with `node scripts/serve.mjs --dist` (stop the other server first).

## 3D snapshots

`materials/data/snapshot.json` maps swing IDs to `{ "fps": 60, "range": [0, 150], "joints": ["golf_club_head"] }`. Ranges are inclusive, zero-based. A null end uses the final reconstruction frame (`[0, null]` plays the whole sequence); a null start uses frame zero. Legacy `ranage` and `golf_club_haed` aliases are supported. Every named joint receives a progressively revealed trail. The pose starts at the first frame; optional `highlight_index` selects another frame. Snapshots use the template carousel with arrows and dots. Each pose automatically loops its selected inclusive frame range at the configured fps, with its trail growing up to the current frame and clearing on loop restart. Playback pauses while the slide is inactive, offscreen, or the browser tab is hidden. Drag with mouse or one finger to rotate; scroll, trackpad pinch, or two-finger pinch to zoom. Legends, frame controls, reset buttons, and gesture hints are omitted. Reconstruction coordinates are preserved. The default and reset view use the face-on camera basis: right [1,0,0], up [0,-1,0], forward [0,0,1], with no initial rotation or horizontal flip.

The snapshot renderer uses locally bundled Three.js 0.170.0 (MIT; `vendor/three/LICENSE`). Bones are solid cylinders and joints are larger spheres enclosing their ends. Opaque meshes and trail tubes use depth testing, shaded materials, and shadow casting/receiving. The ground receives shadows. No external CDN is required at runtime. WebGL2 is required.

The viewer uses a 45° perspective camera with automatic framing for the viewport aspect ratio.

Ground is centered on the median hip midpoint over the selected frame range. Its square side length is exactly twice the maximum absolute X or Z offset of any reconstruction point in that range from that center. Grid spacing remains independent of ground size.

Calibrated face-on and down-the-line camera objects follow the generating notebook’s camera-to-world convention: `world = R × camera + t`. World centers are `t`, camera directions use `R`, and reprojection uses `Rᵀ × (world − t)`. Colored position spheres, green frusta, and optical-axis arrows show calibrated viewing directions; no image-plane poses are rendered. The rotation center is independent of camera markers.

Camera visualization is disabled in snapshots by default. The calibrated camera rendering is retained and can be enabled with `mountSnapshots(root, { showCameras: true })` for reuse when developing the video section.

Trail colors encode frame-to-frame 3D speed (distance × configured fps): blue → cyan → green → yellow → red. Red represents the maximum speed across the full reconstruction sequence and all selected trail joints, using a fixed scale throughout playback. Invalid point pairs are excluded; no smoothing is applied.

Historical clubs are sampled every 0.1 seconds as thin shafts (grip → heel → head), matching the club-head trajectory speed color at that moment. Their opacity fades linearly with age; only the most recent 30% of the selected sequence duration is retained. History clears at loop restart; the current club remains full thickness.

Both trajectory samples and historical clubs fade with age and retain only the most recent 30% of the selected sequence duration.
