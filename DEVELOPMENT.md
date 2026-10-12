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
tools/car-factory/    offline car modelling: SDF designs -> meshed, simplified, AO-baked .glb
```

## The car factory

The six cars are modelled in code and built into `.glb` models by an offline tool in `tools/car-factory/`:

```bash
npm run build:cars                              # all cars, final quality (~1.5 min each)
node tools/car-factory/build.mjs razor --quick  # one car, fast low-res preview (~10 s)
```

- **Designs** (`tools/car-factory/designs/*.js`):
  - Each car is drawn as engineering views: a side silhouette, a plan outline and a cross-section rule, plus a glasshouse drawn the same way.
  - These are combined into a signed distance field.
  - Details are cut in (window openings, headlight pockets, intakes, wheel arches, vents) or added on (splitters, diffuser fins, wings, mirrors, a furnished cockpit).
- **Build steps:**
  - Meshing: sparse surface nets, with the borders between materials straightened.
  - Simplification: meshoptimizer, guided by the surface normals.
    - Hidden parts such as wheel wells and the underbody get coarser first.
    - Three levels of detail: about 97k (full), 49k (light, for phones) and 16k (far) triangles.
  - Baking: normals and ambient occlusion from the field.
- **Separate geometry:** thin details are generated on their own (LED strips, projector lenses and glass panes), laid onto the skin by ray marching.
- **Output:** each build writes two models, each with a gzipped twin that the game prefers, and updates `cars.json` with cache-busting hashes:
  - `<id>.glb`: the full and far versions (about 1.3 MB gzipped), used on high quality.
  - `<id>.m.glb`: the light and far versions (about 0.76 MB gzipped), used on medium and low quality, so phones download and draw less.
- **In game:**
  - The game adds detailed wheels: tyres with tread grooves, four concave rim designs, brake discs that glow under hard braking, and calipers. Each wheel part of all four wheels is one skinned mesh (a steering and a rolling bone per wheel), so a car draws each wheel material once.
  - Rivals switch to the far version beyond 24 m, where parts that look alike at a distance share one mesh.
  - Liveries and panel gaps are painted into an atlas of side, top, front and rear views. The paint shader projects that atlas onto the body, so the models need no UVs.
  - Design metadata in the `.glb` provides the wheel positions, light anchors, exhaust positions, panel lines and livery anchors.
  - A patrol car's light bar uses two extra materials (`beaconR`, `beaconB`) that the game flashes; with reduced flashes they glow in turn instead.
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

- **`id`:** an existing car (`volt`, `razor`, `specter`, `touge`, `marshal`, `brawler`) swaps its model. A new id adds a new car to the garage, copying its handling from `base`.
- **Optional fields:**
  - `rotateY` (degrees) if the car faces the wrong way
  - `length` (metres) or `scale` if auto-scaling picks the wrong size
  - `name`, `class`, `price`, `blurb`, `stats`
- **Quick test:** drag a `.glb` onto the garage screen. It previews on the selected car for that session and reports whether it found the wheels and paint.

**What the loader detects automatically:**
- **Orientation and size:** the model is turned to face forward and scaled to metres (centimetre exports are fine).
- **Wheels:** found by name (`wheel`, `tire`/`tyre`, `rim`…) or by shape. They spin and the front ones steer.
- **Materials:** paint (name contains `paint`, `body`… or the largest coloured surface), glass, head and tail lights, tyres and rims. Paint colour, finish, rim colour, underglow and trails work in the garage. Livery and rim shape are only for car-factory and generated cars.

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
- **Features:** sections (`tunnel`, `city`, `stadium`, `open`), boost pads and ramps are placed with `[commandIndex, fraction]`.
- **Room to boost:** a nitro fired at top speed carries the car about 340 m, and braking under a boost is weak. A straight needs about 450 m before a tight city corner (about 350 m before a fast sweeper) to fit a whole nitro plus the braking. Put boost pads just past a corner exit (`[straight, 0.05–0.12]`). In reverse, a pad is mirrored along its straight, so it still follows a corner exit. Ramps go mid-straight so there is room to land either way round.
- **Look:** `theme` chooses the decorations and `palette` sets every colour.

## Tuning

| What | Where |
| --- | --- |
| Handling (grip, drift, boost, walls, jumps) | `src/game/vehicle.js` |
| Car stats | `src/car/car-defs.js` |
| AI difficulty, mistakes and rubber-banding | `DIFFICULTY` in `src/game/ai.js` |
| Rewards | `onRaceResults` in `src/app.js` |
| Item prices | `src/car/customization.js` |
| Quality presets | `QUALITY_PRESETS` in `src/core/renderer.js` |

## Possible next steps

- **Real-world routes:** build tracks from OpenStreetMap road data (ODbL licence, attribution required) through the same turtle and track pipeline.
- **Online leaderboards and ghost sharing:** these need a small backend. All progress is currently stored locally in the browser.
