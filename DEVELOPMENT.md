# Midnight Overdrive: developer notes

How to run, build and extend the game. For an introduction to the game itself, see the [README](README.md).

## Run it

Requires Node 18 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open the URL Vite prints. The dev server also listens on your network, so you can play on your phone over the same Wi-Fi: open the `Network:` URL on the phone.

## Build and deploy

```bash
npm run build
```

This creates a static site in `dist/`. Upload it to any static host, for example Netlify, Vercel, GitHub Pages, Cloudflare Pages or itch.io (HTML5 game). All paths are relative, so it works from a sub-folder. To preview the production build locally:

```bash
npm run preview
```

**On iPhone:** Safari doesn't allow fullscreen for web pages. Use Share → Add to Home Screen to get a true fullscreen, landscape app. On Android, the game goes fullscreen automatically when a race starts.

## Controls

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Steer | A/D or arrow keys | stick at the bottom left (touch the side you want to turn), or tilt | left stick |
| Throttle | W or up arrow | automatic | RT |
| Brake / reverse | S or down arrow | pull the stick down (hold it to reverse), or DRIFT without steering | LT |
| Drift | Space while steering | hold DRIFT while steering | X or B |
| Nitro | Shift, N or E | NITRO button | A |
| Camera | C | camera button | Y |
| Reset car | R | automatic when stuck | Back |
| Pause | Esc or P | pause button | Start |
| Show / hide the controls card | H | - | - |
| Menus | arrow keys, Enter, Esc to go back | tap | D-pad or left stick, A to select, B to go back |

**Tips:**

- Release a long drift for a bigger turbo.
- Tap nitro exactly at "GO" for a perfect start.

## Project layout

```
src/
  app.js              state machine: title → menu → race → results; rewards and saves
  core/               renderer + post-FX pipeline, input, audio synth + music, storage, math
  world/              track generation, track/decor meshes, shaders, environment, light baking
  car/                car models (factory .glb + generated fallback), wheels, liveries, materials, catalogues
  game/               race orchestration, vehicle physics, AI, camera rig, effects, stunts, ghosts, daily
  scenes/garage.js    photo-studio showroom behind the menus
  ui/                 menus, HUD, touch controls (DOM + CSS)
public/               icons, web manifest, service worker, car models (models/cars), model decoders
tools/blender/        offline modelling in headless Blender: the cars (cars/*.py) and the scenery sets
tools/car-factory/    the .glb writer and the material table the car builds share
```

**Loading:** every scene compiles its shaders before it shows, behind the loading screen (`Renderer.compileAsync`, in the background where the browser supports `KHR_parallel_shader_compile`), and then draws a frame there, which uploads its textures. That covers the title street and the garage at start-up, the street again after a race, and a race while it loads. A new kind of car for the menu street's traffic compiles before it first drives past. A car put in the garage or parked on the street takes over the shaders of the car it replaces before that one is freed (three.js deletes a shader once no material uses it), and the garage only repaints a car it already shows rather than rebuilding it. On a first visit, with nothing in the browser's shader cache, compiling on the first frame instead freezes the game for seconds.

## The cars

All twenty cars are Python scripts that headless Blender builds into `.glb` models (`tools/blender/`; Blender 4.2 or newer, set `BLENDER` if it isn't in the usual place):

```bash
npm run build:cars                                        # every car, final quality (about half a minute each)
node tools/blender/build.mjs razor                        # one car
node tools/blender/build.mjs razor --shape                # a quick sheet of six views, no export (tools/blender/out/)
node tools/blender/build.mjs razor --shape --only=nose,tail --size=1280x800   # close-ups (see lib/studio.py)
```

- **Designs** (`tools/blender/cars/*.py`): each car is drawn as engineering views - a side silhouette, a plan outline and a section rule, plus a glasshouse drawn the same way (most began as the drawings of the retired SDF car factory, re-spaced). The road-car toolkit (`lib/road.py`) builds them:
  - Bodies are lofted from the views. Every section has the same number of points per run, split at crease heights (`keys`) and across the top (`top_keys`), so creases run along fixed vertices and read as clean lines. Fenders, box flares, skirts and hood dips can be part of the sections (`top`, `sec`); the glasshouse is joined on.
  - Detail is laid onto the skin by projecting 2D outlines from a view: `pocket` (cut along the view: lamp housings, intakes, window openings), `panel` (glass, lenses, plates), `ring_panel` and `frit` (window surrounds), `glass_panel` (a lens laid on the skin in a border), `ribbon`, `disc` and `bead` (light strips, lenses, trims).
  - Booleans try Blender's Manifold solver first, then Exact and Float, and refuse a result that loses most of the target or tears it open; a WARNING line names any cut that failed (a build should print none).
  - Pitfalls the scripts avoid (a comment at each place says why): two nearly parallel surfaces seaming, such as a fastback sliding into a deck (give it a clear step; `check_overlap` warns); glass or frames on a glasshouse's fillets; outlines whose curve overshoots (use `road.rounded` or sharp points); a pocket cut along the view into a surface that turns away from it (lay a lens on the skin instead); a wing lofted from its tips only (its shadow is baked at the vertices).
- **Build steps** (`run.py`): three levels of detail, about 100-125k (full), 55-66k (phones) and 15-20k (far) triangles. Ambient occlusion is baked per vertex in Blender through the formula the game's materials are tuned for (an open panel at 0.6, only real crevices and overhangs darker), then smoothed within each smooth surface.
- **Output:** each build writes two models, each with a gzipped twin that the game prefers, and updates `cars.json` with cache-busting hashes:
  - `<id>.glb`: the full and far versions (about 1.3 MB gzipped), used on high quality.
  - `<id>.m.glb`: the light and far versions (about 0.8 MB gzipped), used on medium and low quality, so phones download and draw less.
- **In game:**
  - The game adds detailed wheels: tyres with tread grooves, four concave rim designs, brake discs that glow under hard braking, and calipers. Each wheel part of all four wheels is one skinned mesh (a steering and a rolling bone per wheel), so a car draws each wheel material once. A design can ask for whitewall tyres by setting `whitewall` (the white band's width, in metres) in its wheel layout, as the JUKEBOX does (the MONOPOSTO's slicks use it for a coloured band, `wallColor`).
  - Rivals switch to the far version beyond 24 m, where parts that look alike at a distance share one mesh.
  - Liveries and panel gaps are painted into an atlas of side, top, front and rear views. The paint shader projects that atlas onto the body, so the models need no UVs.
  - Design metadata in the `.glb` provides the wheel positions, light anchors, exhaust positions, panel lines and livery anchors.
  - A patrol car's light bar uses two extra materials (`beaconR`, `beaconB`) that the game flashes; with reduced flashes they glow in turn instead.
  - Amber lenses come in two kinds: `amber` glows all the time as a position lamp, while `indicator` is an unlit amber turn-signal lens (the VICE's rear lamps), which would otherwise look stuck on at night.
  - `plastic` is unpainted dark grey plastic, for a cheap car's bumpers and mouldings (the MOCHI). Far away it shares the black trim's material.
  - Models download when they're needed: your car at start-up, a race's own cars while it loads (each race draws its rivals from two or three models), a car you browse to in the garage, and one other car for the traffic on the menu street.

## Adding real car models

Put `.glb` files in `public/models/cars/` and list them in `public/models/cars/cars.json`:

```json
{
  "cars": [
    { "id": "volt", "file": "my-gt.glb" },
    { "id": "razor", "file": "hypercar.glb", "rotateY": 180 },
    { "id": "phantom", "file": "phantom.glb", "base": "specter", "name": "Phantom R", "class": "Supercar", "price": 25000 }
  ]
}
```

- **`id`:** an existing car (`volt`, `razor`, `specter`, `touge`, `marshal`, `brawler`, `ronin`, `sidewinder`, `vesper`, `juggernaut`, `mochi`, `jukebox`, `cabbie`, `kaido`, `sleeper`, `surge`, `vice`, `enduro`, `apogee`, `monoposto`) swaps its model. A new id adds a new car to the garage, copying its handling from `base`.
- **Optional fields:**
  - `rotateY` (degrees) if the car faces the wrong way
  - `length` (metres) or `scale` if auto-scaling picks the wrong size
  - `name`, `class`, `price`, `blurb`, `stats`
- **Quick test:** drag a `.glb` onto the garage screen. It previews on the selected car for that session and reports whether it found the wheels and paint.

**What the loader detects automatically:**
- **Orientation and size:** the model is turned to face forward and scaled to metres (centimetre exports are fine).
- **Wheels:** found by name (`wheel`, `tire`/`tyre`, `rim`…) or by shape. They spin and the front ones steer.
- **Materials:** paint (name contains `paint`, `body`… or the largest coloured surface), glass, head and tail lights, tyres and rims. Paint colour, finish, rim colour, underglow and trails work in the garage. Livery and rim shape are only for the built-in and generated cars.

**What to look for when buying or making models:**
- glTF 2.0 binary (`.glb`). Draco, Meshopt and KTX2 compression are supported.
- Around 20k–60k triangles, textures 2048 px or smaller, file ideally under 5 MB.
- Wheels as separate meshes, with sensible names for the paint, glass and light materials.
- A licence that allows use in a game. Avoid real brands (Ferrari, Porsche…) unless the licence covers trademarks.

## Adding a track

Tracks are defined in `src/world/tracks.js` as "turtle" commands, so you never place spline points by hand:

```js
path: [
  ['S', 300],          // straight, 300 m
  ['R', 90, 48],       // right turn, 90 degrees, 48 m radius
  ['L', 45, 75],       // left turn
  // ...
],
```

- **Closing the loop:** the turns must add up to 360°. The generator then stretches two straights so the loop closes exactly.
- **Features:** sections (`tunnel`, `city`, `stadium`, `open`, `water`, `quay`), boost pads and ramps are placed with `[commandIndex, fraction]`.
- **Room to boost:** a nitro fired at top speed carries the car about 340 m, and braking under a boost is weak. A straight needs about 450 m before a tight city corner (about 350 m before a fast sweeper) to fit a whole nitro plus the braking. Put boost pads just past a corner exit (`[straight, 0.05–0.12]`). In reverse, a pad is mirrored along its straight, so it still follows a corner exit. Ramps go mid-straight so there is room to land either way round.
- **Look:** `theme` chooses the decorations and `palette` sets every colour.
- **Hills:** `elevation` keyframes are level spots with a smoothstep between them, so a long climb wants as few as it can (the steepest point, mid-way, is 1.5 times the average). On a city track, `hill: true` builds a hill town (Uptown Heights): the ground becomes one hill under the roads, the blocks behind the street front stand on their own ground, every block reaches down the slope below its street, and where the ground falls away beside the road the street front and overpasses are left out for the view. Without it, keep a city track's climbs to a few metres, or the ground falls away and leaves the backs of the buildings floating.
- **Harbour:** on an expressway track, `harbour: { quayOffset, reach, yardDepth }` plus a `water` section and a `quay` section builds a container port that the road drives through (Metro Ring, `src/world/decor-harbour.js`). The quay runs along the `quay` stretch (a straight, authored at ground level in `elevation`), `quayOffset` metres out toward the `water` stretch, and the bay lies beyond it. The land is at the road's height along the quay, and the sea is 3 m below. Cranes stand along the quay: the road passes between their legs only where it is at ground level. Moored ships keep clear of any road over the water. The container yard is `yardDepth` metres deep behind the quay, with rows of stacks lining the road where it runs through the yard at ground level. Ships lie at anchor in the bay, and the city's towers stand only inland. Where the road is low, its skirts become retaining walls down to the sea floor (`skirtTo` in the track style), a causeway over the water; higher up, the piers carry it. The containers are instanced: a stack far from the road is one instance with its boxes painted on, while the rows beside the road are built box by box (high-cubes, pairs of 20 ft boxes, never quite square; the boxes up in a stack get floors, in a second instanced mesh). Their shader paints the steel frame, corrugations, doors and reefer units, rust and grime, and made-up shipping lines from a canvas atlas (no real brands). The fine detail fades out where a pixel covers more than a few centimetres and is off at low quality. On high and medium quality the cranes and yard gantries are a mesh of their own (`SteelParts`, lit at every corner) with a steel shader (`createSteelMaterial`): plate joints with bolted splices, rust and grime, hazard stripes, each crane's number on its portal and a made-up port name on its machinery house, plus more bracing and a lit cab. The cranes near the road also get a stair tower, walkways with railings, bogies on wheels and a cable reel, and the gantries near it stand on tyres. Low quality keeps them plain. Nothing needs placing by hand. `planHarbour` returns the layout as plain numbers, for checking it on a plan.
- **Sets built in Blender:** `scenery: '<id>'` on a track (Floodlight Park, `theme: 'park'`) dresses it with a set modelled in Blender round the real track: the city park in `tools/blender/scenery/park.py`. `node tools/blender/scenery/build.mjs park` exports the track from the game's own `Track`, has Blender (headless, Python) build the set round it, bakes its night lighting in Cycles and writes `public/models/scenery/`:
  - `park.glb`: the meshes, Draco-compressed, with a gzipped twin, one material per role. The game picks its own material by name: things that shine (`lamp`, `window`, `flood`, `glass`) aren't baked, and a lit window named `window.dim` or `window.garage` is drawn as the room behind it (an office, a workshop). Every vertex carries its baked light (RGB, square-root encoded) and how open it is to the sky (A). The scene's extras hold the lamps, the ground's rectangle and the water level. `park.m.glb` is the same without the trees far from the road, for low quality.
  - `park-light.webp`: the ground's light map over the rectangle (1024 a side), encoded the same way.
  - `park-ground.jpg`: the ground's colour map.

  The game (`src/world/scenery.js`) loads the set before the race is built, merges it into one mesh per material, and lights it with the bake plus its own ambient (times the sky value) and the cars' headlights. It also gives the light map to the light baker, so the set's lamps light the road and the cars too. The mirror variant mirrors the set; reverse needs nothing. Without the files, the track falls back to its stadium dressing. The road, barriers and physics are still the game's, so the set keeps outside the barriers. The bake's light is the lamps', a moon and the city's glow in the sky (`MOON`, `SKY_GLOW` in the design). Light baked per vertex needs care: before the bake, building edges are split to under 2 m and hard edges are split apart, so a lamp's pool shows on a long wall and doesn't leak round a corner. Leaves' normals lean out from their crown's middle, so a crown lights as one mass. `--shape --quick` renders previews in seconds (`tools/blender/out/scenery/`), `--quick` bakes fast and rough, and `--blend` saves the `.blend`.
- **Difficulty:** `difficulty` (1 beginner, 2 intermediate, 3 expert) is shown as pips on the setup cards. Judge it from the tight corners (radius 60 m or less), the turning per km, the jumps and the width, then drive it to confirm. The current tracks split two per level.

## Tuning

| What | Where |
| --- | --- |
| Handling (grip, drift, boost, walls, jumps) | `src/game/vehicle.js` |
| Car stats, and traits: `mass` (who shoves whom in a collision), `awd`, `spin` (launch wheelspin), `electric` (motor sound, one speed, no exhaust effects), `patrol`, `stock` (rivals keep its default look) | `src/car/car-defs.js` |
| AI difficulty, mistakes and rubber-banding | `DIFFICULTY` in `src/game/ai.js` |
| Rewards | `onRaceResults` in `src/app.js` |
| Item prices | `src/car/customization.js` |
| Quality presets | `QUALITY_PRESETS` in `src/core/renderer.js` |

## Possible next steps

- **Real-world routes:** build tracks from OpenStreetMap road data (ODbL licence, attribution required) through the same turtle and track pipeline.
- **Online leaderboards and ghost sharing:** these need a small backend. All progress is currently stored locally in the browser.
