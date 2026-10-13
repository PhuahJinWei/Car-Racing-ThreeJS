import * as THREE from 'three';
import { globalUniforms } from './materials.js';

// Night-time city buildings, all from one instanced box and one shader:
//  - facades per style: apartments (stucco/brick, punched windows, curtains), offices (concrete
//    grid, ribbon windows, ceiling light panels, blinds), glass towers (curtain wall, spandrels)
//  - every window looks into a fake 3D room (interior mapping): back wall, floor, ceiling, side
//    walls, a ceiling lamp or office light panels, furniture silhouettes, TV glow
//  - storefronts on the ground floor (lit shops, backlit sign bands, closed shutters)
//  - warm street-light wash on the lower floors, lit crowns on towers, rooftop clutter, beacons
//  - glass reflects a night-city sky (fresnel)
// Instance attributes:
//   aParams  = (seed, lit fraction, style, total building height)
//   aParams2 = (height of this block's base above the street, kind, crown hue, has shops)
//     style: 0 apartments, 0.5 offices, 1 glass tower; kind: 0 building block, 1 rooftop service box

export function createBuildingMaterial(opts = {}) {
  const uniforms = {
    uTime: globalUniforms.uTime,
    uAmbient: globalUniforms.uAmbient,
    uFogColor: globalUniforms.uFogColor,
    uFogDensity: globalUniforms.uFogDensity,
    uStreet: { value: new THREE.Color(opts.street ?? 0xffb26b) },
    uBeacon: { value: new THREE.Color(opts.beacon ?? 0xff2a1a) },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aParams;
      attribute vec4 aParams2;
      varying vec3 vLocal;
      varying vec3 vScale;
      varying vec3 vN;
      varying vec4 vParams;
      varying vec4 vParams2;
      varying vec3 vView;
      varying float vFogDepth;
      void main() {
        mat4 im = instanceMatrix;
        vScale = vec3(length(im[0].xyz), length(im[1].xyz), length(im[2].xyz));
        vLocal = position * vScale;
        vN = normal;
        vParams = aParams;
        vParams2 = aParams2;
        vec4 wp = modelMatrix * im * vec4(position, 1.0);
        // view ray in the block's own (unscaled) frame, for interior mapping and reflections
        mat3 R = mat3(im[0].xyz / vScale.x, im[1].xyz / vScale.y, im[2].xyz / vScale.z);
        vView = transpose(R) * (wp.xyz - cameraPosition);
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uAmbient;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform vec3 uStreet;
      uniform vec3 uBeacon;
      varying vec3 vLocal;
      varying vec3 vScale;
      varying vec3 vN;
      varying vec4 vParams;
      varying vec4 vParams2;
      varying vec3 vView;
      varying float vFogDepth;

      float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
      float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float band(float x, float a, float b, float aa) { return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x)); }

      // reflected night sky: dark zenith, warm light pollution at the horizon, dark ground
      vec3 envNight(vec3 r) {
        float y = r.y;
        vec3 sky = mix(vec3(0.045, 0.05, 0.08), vec3(0.01, 0.012, 0.022), smoothstep(0.0, 0.7, y));
        vec3 glow = vec3(0.5, 0.3, 0.17) * exp(-abs(y) * 7.0) * 0.55;
        vec3 ground = vec3(0.025, 0.02, 0.02) * smoothstep(0.0, -0.25, y);
        return (y > 0.0 ? sky : ground) + glow;
      }

      // One room seen through a window. p: point on the window plane (metres, x across the bay,
      // y up from the room floor, z = 0), d: view direction (z points into the room).
      // kind: 0 apartment, 1 office, 2 shop
      vec3 room(vec3 p, vec3 d, vec3 size, float rnd, vec3 lightCol, float lit, float kind) {
        vec3 ad = max(abs(d), vec3(1e-4));
        float tx = (d.x > 0.0 ? size.x - p.x : p.x) / ad.x;
        float ty = (d.y > 0.0 ? size.y - p.y : p.y) / ad.y;
        float tz = (size.z - p.z) / ad.z;
        float t = min(tx, min(ty, tz));
        vec3 q = p + d * t;
        vec3 wall = kind > 0.5 ? mix(vec3(0.5, 0.52, 0.55), vec3(0.42, 0.47, 0.54), rnd) : mix(vec3(0.7, 0.58, 0.45), vec3(0.55, 0.6, 0.54), fract(rnd * 7.3));
        if (kind > 1.5) wall = mix(vec3(0.75, 0.7, 0.62), vec3(0.35, 0.25, 0.2), step(0.5, rnd));
        vec3 alb;
        float emit = 0.0;
        bool vertical = t != ty;
        if (kind > 1.5 && vertical && q.y < 2.2) {
          // shop shelving full of goods on the back and side walls
          float along = t == tz ? q.x : q.z;
          float shelf = floor(q.y / 0.45);
          vec2 slot = vec2(floor(along * 3.5), shelf);
          float hh = h21(slot + rnd * 31.0);
          vec3 goods = 0.35 + 0.65 * vec3(h21(slot + 1.3), h21(slot + 2.7), h21(slot + 4.1));
          float plank = step(fract(q.y / 0.45), 0.08);
          alb = mix(goods * (0.4 + 0.6 * step(0.25, hh)), vec3(0.85), plank);
        } else if (t == tz) {
          alb = wall;
          if (kind > 0.5 && kind < 1.5) {
            // desks / partitions
            alb *= 1.0 - 0.7 * step(q.y, 1.1) * step(0.5, fract(q.x * 0.35 + rnd));
          } else if (kind < 0.5) {
            // sofa, a picture, a doorway
            float sofa = step(q.y, 0.85) * band(q.x / size.x, 0.12 + rnd * 0.2, 0.62 + rnd * 0.2, 0.01);
            alb = mix(alb, vec3(0.16, 0.1, 0.08) + 0.1 * vec3(rnd, 0.5, 1.0 - rnd), sofa);
            float pic = band(q.y, 1.4, 1.95, 0.01) * band(q.x / size.x, 0.35, 0.6, 0.01);
            alb = mix(alb, vec3(0.3, 0.42, 0.55) * (0.5 + rnd), pic * step(0.4, rnd));
            float door = step(q.y, 2.05) * band(q.x / size.x, 0.8, 0.95, 0.005);
            alb *= 1.0 - 0.6 * door;
          }
        } else if (t == ty) {
          if (d.y < 0.0) {
            alb = kind > 1.5 ? vec3(0.55, 0.53, 0.5) * (0.85 + 0.15 * step(0.5, fract(q.x) + fract(q.z) - 0.5)) : kind > 0.5 ? vec3(0.2, 0.21, 0.23) : vec3(0.33, 0.23, 0.15);
            alb *= 1.0 - 0.4 * step(size.z * 0.55, q.z) * step(0.3, fract(q.x * 0.4 + rnd));
          } else {
            alb = vec3(0.8);
            if (kind > 0.5 && kind < 1.5) {
              vec2 g = vec2(fract(q.x / 1.5 + 0.25), fract(q.z / 1.8 + 0.2));
              emit = band(g.x, 0.15, 0.85, 0.02) * band(g.y, 0.25, 0.6, 0.02);
            } else if (kind > 1.5) {
              vec2 g = fract(q.xz / 1.6) - 0.5;
              emit = smoothstep(0.16, 0.05, length(g));
            } else {
              vec2 c = q.xz - vec2(size.x * 0.5, size.z * 0.45);
              emit = smoothstep(0.35, 0.1, length(c));
            }
          }
        } else {
          alb = wall * 0.9;
        }
        vec3 lp = vec3(size.x * 0.5, size.y - 0.1, size.z * 0.45);
        vec3 L = lp - q;
        float fall = 1.0 / (1.0 + dot(L, L) * (kind > 0.5 ? 0.05 : 0.16));
        float k = (kind > 0.5 && kind < 1.5) ? 0.65 : 1.0; // offices: cooler, dimmer fluorescent
        vec3 light = lit > 0.5 ? lightCol * k * (0.1 + 0.75 * fall) : vec3(0.008, 0.011, 0.022);
        return alb * light + emit * lit * lightCol * 1.5 * k;
      }

      void main() {
        float seed = vParams.x;
        float litFrac = vParams.y;
        float style = vParams.z;
        float totalH = vParams.w;
        float baseY = vParams2.x;
        float kind = vParams2.y;
        float crownHue = vParams2.z;
        float shops = vParams2.w;
        vec3 n = normalize(vN);
        float yAbs = vLocal.y + baseY;
        vec3 V = normalize(vView);
        float bhash = h11(seed * 3.7);

        // per-building facade palette
        vec3 wallCol;
        if (style < 0.25) wallCol = mix(vec3(0.42, 0.3, 0.24), vec3(0.62, 0.58, 0.52), step(0.5, bhash)) * (0.75 + 0.4 * h11(seed * 9.1));
        else if (style < 0.75) wallCol = mix(vec3(0.45, 0.45, 0.46), vec3(0.52, 0.48, 0.42), bhash) * (0.8 + 0.3 * h11(seed * 2.3));
        else wallCol = mix(vec3(0.1, 0.12, 0.15), vec3(0.16, 0.16, 0.18), bhash);
        if (kind > 0.5) wallCol = vec3(0.4, 0.4, 0.42) * (0.7 + 0.4 * bhash);

        // light falling on the walls: night sky, warm street lights below, lit crowns above. A
        // building on a hill reaches down past its street, where the street lights don't reach
        float below = max(-1.2 - yAbs, 0.0);
        float streetWash = (exp(-max(yAbs, 0.0) / 5.0) * 0.32 + exp(-max(yAbs, 0.0) / 18.0) * 0.03) * exp(-below / 4.0);
        vec3 crownCol = mix(mix(vec3(1.0, 0.95, 0.85), vec3(0.45, 0.75, 1.0), step(0.4, crownHue)), vec3(0.85, 0.5, 1.0), step(0.75, crownHue));
        float crown = (totalH > 55.0 && kind < 0.5) ? smoothstep(totalH - 14.0, totalH - 1.0, yAbs) * step(0.35, h11(seed * 5.3)) : 0.0;
        vec3 wallLight = uAmbient * 0.1 + vec3(0.006, 0.007, 0.011) + uStreet * streetWash + crownCol * crown * 0.7;

        vec3 col;
        if (n.y > 0.5) {
          // ---------------------------------------------------------------- roof
          vec2 rp = vLocal.xz;
          vec3 roof = vec3(0.16, 0.16, 0.17) * (0.7 + 0.5 * vnoise(rp * 0.4));
          vec2 hs = vScale.xz * 0.5;
          float edge = 1.0 - smoothstep(0.35, 0.6, min(hs.x - abs(rp.x), hs.y - abs(rp.y)));
          roof = mix(roof, wallCol * 0.8, edge);
          if (kind < 0.5) {
            vec2 cell = floor(rp / 3.2 + seed);
            vec2 cf = fract(rp / 3.2 + seed);
            float unit = step(0.72, h21(cell)) * band(cf.x, 0.15, 0.85, 0.02) * band(cf.y, 0.2, 0.8, 0.02);
            roof = mix(roof, vec3(0.32, 0.33, 0.35), unit);
          }
          col = roof * (uAmbient * 0.4 + vec3(0.05, 0.055, 0.07)) * 2.0;
          if (totalH > 90.0 && kind < 0.5 && h11(seed * 1.7) > 0.6) {
            // helipad
            float r = length(rp);
            float ring = band(r, 5.2, 5.6, 0.05);
            vec2 a = abs(rp);
            float H = (band(a.x, 1.2, 1.6, 0.03) * step(a.y, 2.0)) + band(a.y, -0.2, 0.2, 0.03) * step(a.x, 1.4);
            col += vec3(0.55, 0.55, 0.5) * clamp(ring + H, 0.0, 1.0) * 0.6;
          }
          if (totalH > 55.0 && kind < 0.5) {
            vec2 q = abs(rp) / hs;
            float corner = step(0.92, q.x) * step(0.92, q.y);
            float blink = step(0.55, fract(uTime * 0.5 + h11(seed) * 3.0));
            col += uBeacon * corner * blink * 6.0;
          }
        } else if (n.y < -0.5) {
          col = wallCol * 0.05;
        } else {
          // ---------------------------------------------------------------- facade
          vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), n));
          float u = dot(vLocal, T);
          float faceW = abs(n.x) > 0.5 ? vScale.z : vScale.x;
          float face = floor(n.x * 3.0 + n.z * 5.0 + 8.5);
          vec3 vd = vec3(dot(V, T), V.y, -dot(V, n));
          float uu = u + faceW * 0.5;
          // metres per pixel -> fade fine detail into its average far away
          float mpp = max(fwidth(uu), fwidth(yAbs));

          float podH = kind > 0.5 ? -1.0 : (shops > 0.5 && baseY < 0.5 ? 4.6 : 0.0);
          float floorH = style < 0.25 ? 3.0 : (style < 0.75 ? 3.7 : 3.9);
          float bay = style < 0.25 ? 3.1 : (style < 0.75 ? 3.0 : 1.55);
          float margin = style > 0.75 ? 0.25 : 0.9;
          float nb = max(1.0, floor((faceW - 2.0 * margin) / bay));
          float bayW = (faceW - 2.0 * margin) / nb;
          float bx = (uu - margin) / bayW;
          float bi = floor(bx);
          float bf = fract(bx);
          float fyAbs = (yAbs - podH) / floorH;
          float fi = floor(fyAbs);
          float ff = fract(fyAbs);
          // (floors below the street too, where the ground falls away down a hill)
          bool inGrid = bx >= 0.0 && bx < nb && ((yAbs > podH + 0.3 && yAbs < totalH - 1.2) || yAbs < -2.0);

          vec3 facade = wallCol * (0.85 + 0.25 * vnoise(vec2(uu, yAbs) * 0.35));
          // floor slab lines and a parapet cap
          facade *= 1.0 - 0.18 * band(ff, 0.0, 0.06, 0.01) * max(step(podH, yAbs), step(yAbs, -2.0));
          facade = mix(facade, wallCol * 1.25, band(yAbs, totalH - 1.2, totalH + 1.0, 0.03));
          col = facade * wallLight;

          if (kind > 0.5) {
            // rooftop service box: a door and a vent grille
            float door = band(uu, faceW * 0.5 - 0.5, faceW * 0.5 + 0.5, 0.02) * step(yAbs - baseY, 2.1) * step(0.5, h11(face + seed));
            col = mix(col, vec3(0.02), door);
          } else if (inGrid) {
            // window shape inside its bay
            vec2 w0 = style < 0.25 ? vec2(0.24, 0.27) : (style < 0.75 ? vec2(0.05, 0.3) : vec2(0.03, 0.04));
            vec2 w1 = style < 0.25 ? vec2(0.76, 0.86) : (style < 0.75 ? vec2(0.95, 0.9) : vec2(0.97, 0.94));
            float aax = fwidth(bf) * 0.8 + 0.002;
            float aay = fwidth(ff) * 0.8 + 0.002;
            float inWin = band(bf, w0.x, w1.x, aax) * band(ff, w0.y, w1.y, aay);
            vec2 cell = vec2(bi + face * 37.0, fi) + seed * 13.17;
            float r1 = h21(cell);
            float r2 = h21(cell + 17.3);
            float r3 = h21(cell * 1.7 + 3.1);
            // lights: whole floors of offices tend to be on together
            float floorOn = h21(vec2(fi, seed + face));
            float lit = style < 0.25 ? step(r1, litFrac) : step(floorOn, litFrac) * step(0.08, r1);
            vec3 lightCol = style < 0.25
              ? mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.86, 0.64), r2) * (0.65 + 0.5 * r3)
              : mix(vec3(0.82, 0.9, 1.0), vec3(1.0, 0.95, 0.85), step(0.7, r2)) * (0.7 + 0.35 * r3);
            float tv = (style < 0.25 && lit < 0.5 && r2 < 0.12) ? 1.0 : 0.0;

            // interior of this window's room
            vec3 size = vec3(bayW, floorH, style < 0.25 ? 3.6 : 5.5);
            vec3 p = vec3(bf * bayW, ff * floorH, 0.0);
            vec3 inside = room(p, normalize(vd), size, r3, lightCol, lit, style < 0.25 ? 0.0 : 1.0);
            if (tv > 0.5) inside += vec3(0.25, 0.4, 0.9) * (0.5 + 0.5 * sin(uTime * 7.0 + r3 * 40.0)) * 0.25;
            // curtains (apartments) and blinds (offices)
            if (style < 0.25) {
              float cl = r2 < 0.55 ? r1 * 0.35 : 0.0;
              float cr = r3 < 0.5 ? r2 * 0.35 : 0.0;
              float wx = (bf - w0.x) / (w1.x - w0.x);
              float curt = step(wx, cl) + step(1.0 - cr, wx);
              vec3 fabric = mix(vec3(0.85, 0.75, 0.6), vec3(0.6, 0.3, 0.25), step(0.6, r1));
              inside = mix(inside, fabric * (lit > 0.5 ? lightCol * 0.55 : vec3(0.015)), clamp(curt, 0.0, 1.0));
            } else if (r2 < 0.35) {
              float wy = (ff - w0.y) / (w1.y - w0.y);
              float blind = step(1.0 - r1 * 0.8, wy);
              float slat = 0.75 + 0.25 * step(0.5, fract(wy * floorH * 12.0));
              inside = mix(inside, vec3(0.75) * slat * (lit > 0.5 ? lightCol * 0.7 : vec3(0.02)), blind);
            }
            // glass: interior through it plus a fresnel reflection of the night sky
            float cosT = clamp(-dot(V, n), 0.0, 1.0);
            float F = (style > 0.75 ? 0.08 : 0.04) + 0.9 * pow(1.0 - cosT, 5.0);
            vec3 refl = envNight(reflect(V, n));
            vec3 glass = inside * (1.0 - F) * 0.9 + refl * F * (style > 0.75 ? 1.6 : 1.0);
            // frames and mullions
            float mull = style < 0.25 ? band(bf, 0.495, 0.505, aax) : band(fract(bf * (style > 0.75 ? 1.0 : 2.0)), 0.0, 0.02, aax);
            float transom = style > 0.75 ? 0.0 : band(ff, 0.68, 0.7, aay);
            glass = mix(glass, wallCol * wallLight * 0.5, clamp(mull + transom, 0.0, 1.0) * 0.9);
            // window sill (apartments)
            float sill = style < 0.25 ? band(ff, w0.y - 0.035, w0.y, aay) * band(bf, w0.x - 0.03, w1.x + 0.03, aax) : 0.0;
            col = mix(col, glass, inWin);
            col = mix(col, wallCol * 1.3 * wallLight, sill);

            // far away: windows below a few pixels become per-floor bands (offices light whole
            // floors), and when the floors shrink too, the facade's overall average
            float covered = (w1.x - w0.x) * (w1.y - w0.y);
            vec3 avgLit = (style < 0.25 ? vec3(1.0, 0.75, 0.45) : vec3(0.85, 0.9, 1.0)) * 0.45;
            vec3 refl0 = envNight(reflect(V, n)) * F;
            float floorLit = style < 0.25 ? litFrac : step(floorOn, litFrac) * 0.92;
            float rowWin = band(ff, w0.y, w1.y, aay);
            vec3 bandCol = mix(facade * wallLight, avgLit * floorLit * (w1.x - w0.x) * 1.6 + refl0, rowWin);
            vec3 avg = mix(facade * wallLight, avgLit * litFrac + refl0, covered);
            float px = mpp / min(bayW, floorH);
            col = mix(col, bandCol, smoothstep(0.12, 0.4, px));
            col = mix(col, avg, smoothstep(0.45, 0.9, mpp / floorH));
          }

          // ---------------------------------------------------------------- storefronts
          if (podH > 0.0 && yAbs < podH && yAbs > -1.2) {
            float sw = 6.0 + 2.5 * h11(seed * 4.1);
            float sx = (uu + 0.5) / sw;
            float si = floor(sx);
            float sf = fract(sx);
            float sr = h21(vec2(si, seed + face * 3.0));
            float aa = fwidth(sf) * 0.8 + 0.003;
            vec3 base = vec3(0.2, 0.2, 0.21) * (0.8 + 0.4 * sr);
            col = base * wallLight;
            float shopWin = band(sf, 0.07, 0.93, aa) * band(yAbs, 0.35, 3.25, 0.02);
            float signBand = band(sf, 0.05, 0.95, aa) * band(yAbs, 3.45, 4.25, 0.02);
            float shutter = step(sr, 0.22);
            vec3 hue = sr < 0.4 ? vec3(1.0, 0.25, 0.2) : sr < 0.55 ? vec3(1.0, 0.85, 0.35) : sr < 0.7 ? vec3(0.35, 0.8, 1.0) : sr < 0.85 ? vec3(0.4, 1.0, 0.55) : vec3(1.0, 1.0, 1.0);
            if (shutter > 0.5) {
              float rib = 0.75 + 0.25 * step(0.5, fract(yAbs * 9.0));
              col = mix(col, vec3(0.38, 0.39, 0.42) * rib * wallLight * 1.2, shopWin);
            } else {
              vec3 lc = mix(vec3(1.0, 0.82, 0.6), vec3(0.92, 0.96, 1.0), step(0.65, h11(sr * 9.0)));
              vec3 pin = vec3(sf * sw, yAbs - 0.35, 0.0);
              vec3 shop = room(pin, normalize(vd), vec3(sw, 2.9, 7.0), sr, lc * 1.6, 1.0, 2.0);
              float cosT = clamp(-dot(V, n), 0.0, 1.0);
              float F = 0.04 + 0.9 * pow(1.0 - cosT, 5.0);
              shop = shop * (1.0 - F) + envNight(reflect(V, n)) * F;
              // a door in some shops
              float door = band(sf, 0.42, 0.58, aa) * step(yAbs, 2.4) * step(0.5, h11(sr * 3.3));
              shop = mix(shop, shop * 0.35 + vec3(0.02), door);
              col = mix(col, shop, shopWin);
            }
            // backlit sign with text-like strokes
            float letters = step(0.35, h21(floor(vec2(sf * sw * 2.2, (yAbs - 3.45) * 3.0)) + si * 7.0)) * band(yAbs, 3.6, 4.1, 0.02) * band(sf, 0.18, 0.82, aa);
            vec3 sign = hue * (0.25 + 1.6 * letters) * (shutter > 0.5 ? 0.25 : 1.0);
            col = mix(col, sign, signBand);
            // light spilling from the shops onto the pavement-level wall
            col += hue * 0.05 * (1.0 - shutter) * band(yAbs, 0.0, 4.4, 0.3);
          }
        }

        float fd = uFogDensity * 0.75 * vFogDepth;
        col = mix(col, uFogColor, 1.0 - exp(-fd * fd));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
