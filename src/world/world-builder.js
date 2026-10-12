import * as THREE from 'three';
import { Track } from './track.js';
import { getTrackDef } from './tracks.js';
import { LightBaker } from './lighting.js';
import { buildTrackSurfaces, buildPillars, buildBoostPads, buildRamps, buildStartGantry, barrierFaceOffset } from './track-mesh.js';
import { buildLamps, buildChevrons, buildGantries, buildSignGantries, buildTerrain, createGroundMaterial } from './decor-common.js';
import { buildCity } from './decor-city.js';
import { buildStadium } from './decor-stadium.js';
import { createEnvironment, createEnvMap } from './environment.js';
import { globalUniforms, setCover } from './materials.js';
import { CoverMap } from './cover-map.js';
import { rng, hashString } from '../core/math.js';

/**
 * Builds a complete race world (track + surroundings) for a track id and variant.
 * quality: { decorDensity, cones }
 */
export function buildWorld(renderer, trackId, variant, quality = {}) {
  const def = getTrackDef(trackId);
  const track = new Track(def, variant);
  const palette = { ...def.palette };
  const rain = variant.weather === 'rain';
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const baker = new LightBaker(track);
  const rand = rng(hashString(track.key));
  const density = quality.decorDensity ?? 1;
  const W = track.halfWidth;

  const env = createEnvironment(scene, palette, {
    fogMul: rain ? 1.25 : 1,
    stars: rain ? 0 : 1,
    clouds: rain ? 1.6 : 1,
    overcast: rain ? 1 : 0,
    skyline: true,
    skylineHeight: def.theme === 'stadium' ? 0.25 : 0.55,
    skylineDensity: def.theme === 'stadium' ? 0.5 : 1,
    hemi: 1.0,
  });
  globalUniforms.uWet.value = rain ? 1 : 0;

  let groundY = track.bounds.minY - 0.9;
  const style = { groundY };

  // Realistic night look: concrete barriers with amber reflector studs, white road paint,
  // real road tunnels. Light comes from lamps, windows, signs and the cars themselves.
  const studs = (h = 0.75, wallH = 1.0) => {
    const d = W + 0.6 + barrierFaceOffset(h, wallH) - 0.012;
    return [
      { d: -d, h, color: '#ffb347', w: 0.07 },
      { d, h, color: '#ffb347', w: 0.07 },
    ];
  };
  const tunnelStyle = (lamp) => ({
    wallHeight: 4.6,
    apex: 6.8,
    material: { tile: 0xbab5a8, concrete: 0x3a3c41, lamp, spacing: 4.5, outer: 0x2a2b30, brightness: 1.0 },
    ambient: 0x221f1a,
    light: 0.75,
    portalColor: 0x4c4e54,
  });
  if (def.theme === 'tunnel') {
    groundY = track.bounds.minY - 70;
    Object.assign(style, {
      groundY,
      skirt: 1.6,
      road: { lanes: 3, edgeColor: '#f0f0f0', edgeGlow: 0.06, laneColor: '#e6e6e6', laneGlow: 0.03, grid: true, brightness: 2.6, sheen: '#0a0c12' },
      wall: { albedo: 0x6a6c72, height: 1.1, brightness: 2.6 },
      neon: studs(0.8, 1.1),
      neonIntensity: 1.1,
      neonDash: 4,
      tunnel: tunnelStyle(0xffdcaa),
    });
  } else if (def.theme === 'city') {
    Object.assign(style, {
      skirt: 1.4,
      road: { lanes: 4, edgeColor: '#e8e8e8', edgeGlow: 0.04, laneColor: '#dddddd', laneGlow: 0.02, centerLine: true, centerColor: '#ffbf2f', grid: true, brightness: 2.5, sheen: '#0a0c12' },
      wall: { albedo: 0x6a6b70, height: 1.0, brightness: 2.6 },
      neon: studs(0.7, 1.0),
      neonIntensity: 0.9,
      neonDash: 5,
      tunnel: tunnelStyle(0xffd0a0),
    });
  } else {
    Object.assign(style, {
      skirt: 1.4,
      road: { lanes: 1, edgeColor: '#ffffff', edgeGlow: 0.04, curbs: true, curbColor: '#e3202a', grid: true, brightness: 2.6, sheen: '#0a0e16' },
      wall: { albedo: 0x6e7076, height: 1.05, stripes: 0, brightness: 2.6 },
      neon: [],
    });
  }

  // ---- Decor that also contributes baked light (must exist before road baking) ----
  const decor = new THREE.Group();
  root.add(decor);
  let crowdMat = null;
  const notTunnel = (i) => !track.tunnelFlags[i];
  // what keeps the rain off: tunnel roofs (below) and overpasses (registered by the city)
  const cover = new CoverMap(track.bounds);

  if (def.theme === 'tunnel') {
    // towers rising from the city far below, alongside the elevated expressway
    const towers = buildCity(track, baker, palette, rand, {
      density,
      groundY,
      signs: false,
      shops: false,
      rows: [
        { setback: 22, dMin: 16, dMax: 26, hMin: -35, hMax: 45, gap: [14, 40] },
        { setback: 60, dMin: 18, dMax: 32, hMin: -10, hMax: 110, gap: [10, 30] },
        { setback: 120, dMin: 22, dMax: 40, hMin: 10, hMax: 170, gap: [12, 36] },
      ],
    });
    decor.add(towers);
    const gantries = buildSignGantries(track, baker, { spacing: 430, filter: notTunnel });
    if (gantries) decor.add(gantries);
    const lamps = buildLamps(track, baker, { spacing: 38, filter: notTunnel, paired: true, color: palette.lamp, intensity: 0.85, radius: 22, height: 11, arm: 3.2, offset: 1.8 });
    if (lamps) decor.add(lamps);
    const pillars = buildPillars(track, groundY, { spacing: 40, minHeight: 4 });
    if (pillars) decor.add(pillars);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), createGroundMaterial(palette, 'carpet'));
    ground.position.set((track.bounds.minX + track.bounds.maxX) / 2, groundY, (track.bounds.minZ + track.bounds.maxZ) / 2);
    decor.add(ground);
  } else if (def.theme === 'city') {
    const city = buildCity(track, baker, palette, rand, { density, overpasses: 4, filter: notTunnel, cover });
    decor.add(city);
    const lamps = buildLamps(track, baker, { spacing: 30, filter: notTunnel, paired: true, color: palette.lamp, intensity: 0.8, radius: 20, offset: 2.4, height: 8.5, arm: 2.4 });
    if (lamps) decor.add(lamps);
    const terrain = buildTerrain(track, palette, { style: 'asphalt', baseY: track.bounds.minY - 1.2 });
    decor.add(terrain);
  } else {
    const stadium = buildStadium(track, baker, palette, rand, { density, cones: quality.cones !== false, coneIntensity: rain ? 0.12 : 0.09 });
    decor.add(stadium);
    crowdMat = stadium.userData.crowdMat || null;
    const terrain = buildTerrain(track, palette, { style: 'grass', baseY: track.bounds.minY - 1.0 });
    decor.add(terrain);
    const gantries = buildGantries(track, baker, palette, { spacing: 260, color: '#f2f6ff', intensity: 0.9 });
    if (gantries) decor.add(gantries);
  }
  const chevrons = buildChevrons(track, palette, {
    board: def.theme === 'city' ? '#e8b400' : '#c8141c',
    arrow: def.theme === 'city' ? '#111111' : '#f4f4f4',
    intensity: 0.75,
    minCurvature: def.theme === 'tunnel' ? 1 / 140 : 1 / 100,
  });
  if (chevrons) {
    decor.add(chevrons);
    const tmp = [0, 0, 0];
    const m = new THREE.Matrix4();
    chevrons.userData.lightItems.forEach((i, n) => {
      chevrons.userData.postMesh.getMatrixAt(n, m);
      baker.sample(i, m.elements[12], m.elements[13], m.elements[14], tmp);
      chevrons.userData.postLight.set(tmp, n * 3);
    });
  }

  // ---- Core surfaces (road gets baked with all lights registered above) ----
  const surfaces = buildTrackSurfaces(track, style, baker, root);
  const pads = buildBoostPads(track);
  if (pads) root.add(pads);
  const ramps = buildRamps(track, baker);
  if (ramps) root.add(ramps);
  const startGantry = buildStartGantry(track, palette);
  root.add(startGantry);
  // props that were built before every light existed get their light now
  baker.flushDeferred();

  if (style.tunnel) {
    // the tunnel tube: its walls stand just outside the road edge, the roof peaks at the apex
    const half = W + 1.3 + 0.5;
    const top = (style.tunnel.apex ?? 6.8) + 0.4;
    for (let i = 0; i < track.n; i++) {
      if (!track.tunnelFlags[i]) continue;
      const l = Math.hypot(track.tx[i], track.tz[i]) || 1;
      cover.addRect(track.px[i], track.pz[i], track.tx[i] / l, track.tz[i] / l, track.ds * 0.75, half, track.py[i] + top);
    }
  }
  cover.build();
  setCover(cover);

  const envRT = createEnvMap(renderer, palette, { softbox: def.theme === 'stadium' ? 3.0 : 2.4 });
  scene.environment = envRT.texture;

  // Light probe for dynamic objects (cars): sample baked light at a world point.
  const probeOut = [0, 0, 0];
  const lightAt = (i, x, y, z, out) => {
    baker.sample(i, x, y + 1.5, z, probeOut);
    out.setRGB(probeOut[0], probeOut[1], probeOut[2]);
    return out;
  };

  return {
    def,
    track,
    scene,
    root,
    palette,
    env,
    envMap: envRT.texture,
    baker,
    groundY,
    rain,
    cover,
    crowdMat,
    surfaces,
    lightAt,
    startLights: startGantry.userData.startLights,
    update(dt, camera) {
      env.update(camera);
    },
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m.map) m.map.dispose();
            m.dispose();
          }
        }
      });
      envRT.dispose();
      env.dispose();
      if (globalUniforms.uCover.value === cover.texture) setCover(null);
      cover.dispose();
    },
  };
}
