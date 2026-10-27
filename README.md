# Golf Swing 3D Reconstruction

Static project page using the visual template from `improving-golf-swing-pose-estimation`: system sans-serif typography, sage palette, responsive section layout, and collapsible left navigation.

## Local development

Requires Node.js 22 or later and ffmpeg for browser-compatible video previews. No npm dependencies to install.

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

Calibrated face-on and down-the-line camera objects follow the generating notebook’s camera-to-world convention: `world = R × camera + t`. World centers are `t`, camera directions use `R`, and reprojection uses `Rᵀ × (world − t)`. Camera bodies with lenses, green frusta, and optical-axis arrows show calibrated viewing directions; no image-plane poses are rendered. The rotation center is independent of camera markers.

Camera visualization is disabled in snapshots by default. The calibrated camera rendering is retained and can be enabled with `mountSnapshots(root, { showCameras: true })` for reuse when developing the video section.

Trail colors encode frame-to-frame 3D speed (distance × configured fps): blue → cyan → green → yellow → red. Red represents the maximum speed across the full reconstruction sequence and all selected trail joints, using a fixed scale throughout playback. Invalid point pairs are excluded; no smoothing is applied.

Historical clubs are sampled every 0.1 seconds as thin shafts (grip → heel → head), matching the club-head trajectory speed color at that moment. Their opacity fades linearly with age; only the most recent 30% of the selected sequence duration is retained. History clears at loop restart; the current club remains full thickness.

Both trajectory samples and historical clubs fade with age and retain only the most recent 30% of the selected sequence duration.

## Videos

Results includes synchronized face-on/down-the-line videos embedded as textures on calibrated camera image planes inside the 3D scene, frame stepping, a timeline, and play/pause. The selection sidebar contains names only. `materials/data/videos.json` lists the available swings, media paths, frame counts, and measured per-view fps. Clips align by frame index, using each view’s own fps for seeking; the face-on video drives playback. The catalog is generated from current source folders; no manual list edits are needed. The static build includes catalog-listed videos and reconstruction JSON.

Server startup and builds prepare cached H.264 video previews using ffmpeg. Originals remain unchanged; generated previews are ignored by Git and regenerated in GitHub Actions.

Video planes use the camera intrinsics for dimensions and principal-point offsets, and the saved camera-to-world pose for placement. Video mode opens at an oblique angle to show both planes; its orbit center remains unchanged. The source video elements remain decoder surfaces; their separate 2D panels are removed.

Video image planes sit along each optical axis at one-third of the distance between camera and median golfer hip center. Their dimensions scale with depth to preserve projection alignment.

Video scenes frame the pose and its motion by default; camera and image-plane extents do not affect framing. Camera name labels are omitted. Right-button drag or two-finger drag pans the projection while preserving the world-space orbit center; left-button/one-finger drag rotates, and scroll/pinch zooms. Snapshot gestures remain unchanged.

In video scenes, the ground also covers all calibrated camera positions with one grid cell of clearance. This does not affect pose-focused framing or the rotation center; snapshot ground sizing is unchanged.

Ground height uses the lowest rendered pose point over the entire reconstruction, with joint-radius clearance, plus the bounding boxes of camera models, viewing outlines, and video planes when present. A small gap prevents contact artifacts. Height stays fixed throughout playback, independent of the selected range. Ankle-based height remains only a scale reference for grid spacing and mesh sizes.

Each calibrated camera has a shaded tripod with a center column, three spread legs, and rubber feet resting on the ground. Tripods follow ground-height updates without affecting the lowest-object calculation. Ground footprint includes clearance for the feet.

Playback waits for both source videos to decode their first frame. The master video’s decoded-frame callbacks drive 3D updates; the other view corrects small timing drift through playback-rate adjustment instead of repeated seeks. Canvas buffers resize only when layout dimensions change. Video mode caps device pixel ratio at 1.5 and uses 1024px shadow maps to reduce GPU load.

Video planes include raw per-frame 2D detections from `materials/data/2d_dections/`, using the template’s yellow (#ffce69) connections and joint rings, blue left-joint centers, red right-joint centers, and yellow central joints, distinct from the mint reconstruction. Face-on and Down-the-line presets use the saved calibrated camera poses; Free-view restores orbit controls. Camera bodies, tripods, and frustum guides are hidden in calibrated presets so they do not obstruct the image plane.

Camera presets use the playground_v6 transition behavior: a one-second quintic-eased flight, linear position interpolation, quaternion rotation interpolation, and a smooth field-of-view/pan/zoom transition. Switching back to Free-view restores the saved orbit, pan, and zoom. Interrupted flights continue from the current rendered camera pose; reduced-motion preference switches immediately. Both endpoints retain perspective projection in this viewer.

Video image planes use 0.3 opacity. The destination camera’s optical-axis arrow is hidden immediately when entering its preset, including during the transition.

Video frame indices use ffprobe presentation timestamps from each encoded preview (`*.mp4.frames.json`). Frame seeking targets the interior of a frame and queues video requests until both decoders confirm presentation; the requested 2D/3D pose updates immediately during scrubbing and decoder completion cannot roll it back. UI frame labels are one-based; detection/reconstruction arrays remain zero-based. Shortcuts match the template: Space toggles play/stop, Left/Right step one frame, and holding an arrow uses native key repeat. Instructions appear below the controls.

Calibrated Face-on and Down-the-line modes also allow left-drag/one-finger rotation, right-drag/two-finger pan, and scroll/pinch zoom. These are temporary navigation offsets around the unchanged rotation center; saved R, t, and K remain unchanged. Re-entering a preset restores its calibrated baseline.

Clicking an active calibrated view again returns its rotation and pan to the calibrated baseline with the same smooth flight, preserving the current zoom. If already centered, the click does nothing.

Raw 2D connections use thin solid geometry and joint rings scale with zoom, exposing more detail when magnified. During rapid scrubbing the skeleton responds immediately; source video decoding can briefly trail the requested pose until the latest seek completes.

The video viewport reserves a fixed responsive height during loading and selection changes. Viewing cameras are constrained above the ground during orbiting and preset transitions, without changing the orbit center.

The hero uses the template banner treatment with an animated 3D reconstruction behind the title and subtitle, a soft overlay, and play/pause. Copy and banner swing/range/fps are managed in `materials/content.json`. Playback pauses offscreen and honors reduced-motion preference at startup.

The banner reuses the video scene in a fixed face-on view, centered and fit by video width. It autoplays the face-on video with synchronized 3D skeleton rendered in front of the video plane. It includes faded rainbow club history over the latest 30% of the sequence. It has no raw 2D overlay, ground, camera decorations, gestures, or playback controls.

Set `page.banner.fps` in `materials/content.json` to control how many source frames play per second. For Swing 00 (24 fps source), `60` plays at 2.5× speed and `24` at normal speed. The 3D pose and club history remain synchronized to the video. Missing or invalid fps uses the source frame rate.

The local server regenerates video discovery on catalog requests. Reloading or returning to the tab refreshes the name list without browser caching. A swing is listed only when both source videos, both detection JSON files, and its reconstruction exist. Cached previews never create entries. Builds clean dist before packaging so removed assets cannot persist in deployment. Restart an already-running older server once after this change.

Video scenes show flat ground-distance rings centered on the ground projection of the fixed rotation center. Red/yellow rings match the calibrated cameras; a mint ring and circular crosshair track the viewing camera’s horizontal distance and position. These are line primitives with no volume, and optical-axis arrows are removed. Rings do not alter ground bounds, orbit center, or calibration.

The video viewport has a vertical Distance slider on its right edge. It moves the viewing camera radially closer/farther around the fixed orbit center (0.4–3× baseline distance), independently of scroll/pinch lens zoom. Calibrated camera data remain unchanged.
