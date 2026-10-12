# Midnight Overdrive

A hyper-fast night-time street-racing game that runs in any modern browser, built mobile-first. The tracks, city, lighting, music and sound effects are generated in code, and cars can use real 3D models (`.glb`) or the built-in generated ones. A first visit downloads about 290 KB.

## Features

- **3 tracks, 8 variants each:** *Skyline Expressway* (elevated freeway and road tunnels), *Downtown Loop* (city blocks with a jump), *Midnight Circuit* (floodlit stadium). Each can be driven forward or reversed, mirrored or not, in clear weather or rain.
- **Speed effects:** radial motion blur that streaks out from the direction of travel, field-of-view punch, camera lag and surge, dutch-angle roll, screen shake, speed lines, chromatic aberration, and slow motion on razor-close passes and big jumps.
- **Night lighting:**
  - dark city skies with light pollution and low clouds
  - city buildings whose windows look into 3D rooms (interior mapping): warm flats with curtains and TV glow, offices with rows of ceiling panels, lit convenience stores and roller shutters, lit tower crowns and aviation beacons
  - LED street lamps with glowing heads, F-shape concrete barriers with reflector strips, highway sign gantries, road tunnels with ceiling luminaires, concrete overpasses
  - a floodlit circuit with lamp-bank masts, truss light gantries, grandstands with LED advertising boards and a lit crowd, and F1-style start lights that count down the start
  - cars light up as they pass under real lamp positions (and tunnel lights), with soft contact shadows
  - HDR bloom, baked light pools on the road, wet-road reflections
  - headlights, brake lights, light trails, and reflections of passing lights sliding over the paint
  - optional underglow from the garage
- **Arcade handling:**
  - Hold-to-drift charges a mini-turbo in three tiers (blue, orange, purple).
  - Nitro charges refill from drifts, near misses, slipstreaming and big air.
  - Boost pads, ramps, wall scrapes with sparks.
- **5 AI rivals:** they follow a racing line, brake for corners, overtake each other, use nitro, and make human mistakes (running wide, lifting off, wobbling). Four difficulty levels: Rookie, Easy, Normal and Hard.
- **Modes:**
  - **Race:** Rookie, Easy, Normal or Hard rivals. On easier levels you start mid-pack.
  - **Time Trial:** race a hologram ghost of your best run.
  - **Daily Challenge:** one seeded track and objective per day, with a streak bonus.
- **Garage:** 3 cars and 8 cosmetic categories (paint, finish, livery, accent, rims, rim colour, underglow, light trail), bought with credits earned from races.
- **Interface:** a night-motorsport look with smoked-glass panels, condensed type and one amber accent.
  - Event setup: track maps, lap records and every race option on one screen.
  - Garage: the car stays centre stage while you try styles from a bottom dock; swatches preview each style in your car's colours.
  - Tabbed settings, plus a profile tab with career stats.
  - Race loading card: track map, conditions and a gameplay tip.
  - HUD: segmented rev gauge with a shift light, live standings, lap splits against your best lap, and a minimap with a heading arrow.
  - Menus work with touch, mouse, keyboard or gamepad.
- **Mobile support:**
  - touch steering pad or tilt steering
  - auto-accelerate
  - haptics on Android
  - automatic quality and dynamic resolution
  - installable as an app (PWA) that works offline

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
| Steer | A/D or arrow keys | left pad (slide for analog), or tilt | left stick |
| Throttle | W or up arrow | automatic | RT |
| Brake / reverse | S or down arrow | DRIFT button without steering | LT |
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

The three cars are modelled in code and built into `.glb` models by an offline tool in `tools/car-factory/`:

```bash
npm run build:cars                              # all cars, final quality (~1.5 min)
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
    - Two levels of detail: about 97k and 16k triangles.
  - Baking: normals and ambient occlusion from the field.
- **Separate geometry:** thin details are generated on their own (LED strips, projector lenses and glass panes), laid onto the skin by ray marching.
- **Output:** each build writes `<id>.glb`, a gzipped `<id>.glb.gz` (about 1.2 MB, which the game prefers) and updates `cars.json` with a cache-busting hash.
- **In game:**
  - The game adds detailed wheels: tyres with tread grooves, four concave rim designs, brake discs that glow under hard braking, and calipers.
  - Liveries and panel gaps are painted into an atlas of side, top, front and rear views. The paint shader projects that atlas onto the body, so the models need no UVs.
  - Design metadata in the `.glb` provides the wheel positions, light anchors, exhaust positions, panel lines and livery anchors.

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

- **`id`:** an existing car (`volt`, `razor`, `specter`) swaps its model. A new id adds a new car to the garage, copying its handling from `base`.
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
