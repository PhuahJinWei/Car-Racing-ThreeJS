// Circuit definitions. Paths use turtle commands:
//   ['S', length]            straight
//   ['L'|'R', degrees, radius] constant-radius corner
// Feature positions are either fractions of the loop or [commandIndex, fraction].
// difficulty: 1 beginner, 2 intermediate, 3 expert. Shown as pips on the setup cards; judged
// from tight corners (radius 60 m or less), turning per km, jumps and width.

// Boost pads are switched off for now. Their positions stay below, so turning this back on
// restores them as they were.
export const BOOST_PADS_ON = false;

export const TRACKS = [
  {
    id: 'lumen',
    name: 'SKYLINE EXPRESSWAY',
    tagline: 'Elevated freeway and long tunnels above a sleeping city.',
    theme: 'tunnel',
    difficulty: 1,
    width: 17,
    laps: 2,
    startOffset: 200,
    bankGain: 16,
    maxBank: 0.24,
    path: [
      ['S', 560], // 0 main straight
      ['R', 55, 230], // 1
      ['S', 250], // 2
      ['L', 35, 200], // 3
      ['R', 115, 170], // 4
      ['S', 560], // 5
      ['R', 40, 320], // 6
      ['L', 50, 160], // 7
      ['R', 70, 115], // 8
      ['S', 510], // 9
      ['R', 70, 210], // 10
      ['S', 320], // 11
      ['L', 30, 220], // 12
      ['R', 85, 140], // 13
      ['S', 410], // 14
      ['R', 40, 260], // 15
    ],
    elevation: [
      [0.0, 0],
      [0.12, 6],
      [0.24, 14],
      [0.36, 8],
      [0.48, -4],
      [0.6, 2],
      [0.72, 12],
      [0.84, 4],
    ],
    sections: [
      { type: 'tunnel', from: [1, 0.1], to: [5, 0.4] },
      { type: 'tunnel', from: [8, 0.1], to: [11, 0.5] },
      { type: 'tunnel', from: [13, 0.3], to: [15, 0.7] },
      { type: 'open', from: [5, 0.4], to: [8, 0.1] },
      { type: 'open', from: [11, 0.5], to: [13, 0.3] },
      { type: 'open', from: [15, 0.7], to: [1, 0.1] },
    ],
    // Pads sit just past a corner exit, with the whole straight ahead to use the boost and
    // brake (track.js mirrors them along their straight in reverse).
    boostPads: [
      { at: [0, 0.08], offset: 0 },
      { at: [5, 0.08], offset: -2.5 },
      { at: [9, 0.08], offset: -2.5 },
      { at: [14, 0.1], offset: -2.5 },
    ],
    ramps: [],
    palette: {
      lamp: '#ffc27e',
      lamp2: '#e4ecff',
      primary: '#ffad4a',
      secondary: '#e9eef7',
      accent: '#ff3b2f',
      warm: '#ffcf8a',
      sign: '#0f6b3a',
      skyTop: '#010205',
      skyHorizon: '#0a1220',
      skyGlow: '#3d2b1c',
      clouds: 0.65,
      stars: 0.12,
      fog: '#070b13',
      fogDensity: 0.0022,
      ambient: '#1a2232',
      ground: '#030406',
      exposure: 1.0,
      tint: [1.0, 1.0, 1.03],
    },
  },
  {
    id: 'district',
    name: 'DOWNTOWN LOOP',
    tagline: 'Wet city blocks after midnight. Tight corners and one huge jump.',
    theme: 'city',
    difficulty: 2,
    width: 16,
    laps: 3,
    startOffset: 200,
    bankGain: 4,
    maxBank: 0.1,
    path: [
      ['S', 560], // 0 main boulevard
      ['R', 90, 48], // 1
      ['S', 205], // 2
      ['L', 90, 44], // 3
      ['S', 175], // 4
      ['R', 90, 48], // 5
      ['S', 610], // 6 jump straight
      ['R', 90, 55], // 7
      ['S', 480], // 8
      ['R', 45, 75], // 9
      ['S', 150], // 10
      ['L', 45, 75], // 11
      ['S', 520], // 12
      ['R', 135, 38], // 13 hairpin
      ['S', 390], // 14
      ['L', 90, 48], // 15
      ['S', 200], // 16
      ['R', 90, 48], // 17
      ['S', 310], // 18
      ['R', 45, 90], // 19
    ],
    elevation: [
      [0.0, 0],
      [0.2, 1],
      [0.4, 4],
      [0.55, 3],
      [0.7, -2],
      [0.85, 0],
    ],
    sections: [
      { type: 'city', from: 0, to: 0.999 },
      { type: 'tunnel', from: [14, 0.25], to: [14, 0.8] },
    ],
    boostPads: [
      { at: [0, 0.06], offset: 0 },
      { at: [6, 0.12], offset: 0 }, // into the jump
      { at: [8, 0.08], offset: -3 },
      { at: [14, 0.12], offset: 0 },
    ],
    // mid-straight, so there is room to land and brake either way round
    ramps: [{ at: [6, 0.48], length: 26, height: 2.8, width: 10, offset: 0 }],
    palette: {
      lamp: '#e6eeff',
      lamp2: '#ffb46a',
      primary: '#ffad4a',
      secondary: '#e9eef7',
      accent: '#ff3b2f',
      warm: '#ffc98a',
      sign: '#0f6b3a',
      skyTop: '#010204',
      skyHorizon: '#0c1018',
      skyGlow: '#4a3420',
      clouds: 0.8,
      stars: 0.05,
      fog: '#0a0d14',
      fogDensity: 0.003,
      ambient: '#1c2230',
      ground: '#050608',
      exposure: 1.0,
      tint: [1.0, 1.0, 1.02],
    },
  },
  {
    id: 'circuit',
    name: 'MIDNIGHT CIRCUIT',
    tagline: 'Floodlit grand prix circuit. Haze, rain and a packed grandstand.',
    theme: 'stadium',
    difficulty: 2,
    width: 16,
    laps: 3,
    startOffset: 320,
    bankGain: 8,
    maxBank: 0.14,
    path: [
      ['S', 630], // 0 main straight
      ['R', 100, 55], // 1 turn 1
      ['S', 185], // 2
      ['L', 50, 90], // 3
      ['R', 85, 110], // 4
      ['S', 480], // 5 back straight
      ['R', 45, 180], // 6
      ['S', 255], // 7
      ['L', 60, 50], // 8
      ['R', 150, 40], // 9 hairpin
      ['S', 370], // 10
      ['L', 30, 60], // 11 chicane
      ['R', 30, 60], // 12
      ['S', 220], // 13
      ['R', 60, 140], // 14 fast sweeper
      ['L', 30, 120], // 15
      ['R', 60, 90], // 16
    ],
    elevation: [
      [0.0, 0],
      [0.15, 2],
      [0.3, 8],
      [0.45, 10],
      [0.6, 4],
      [0.75, -2],
      [0.9, 0],
    ],
    sections: [
      { type: 'stadium', from: [0, 0.0], to: [1, 0.3] },
      { type: 'stadium', from: [9, 0.0], to: [9, 1.0] },
      { type: 'stadium', from: [14, 0.2], to: [15, 0.6] },
    ],
    boostPads: [
      { at: [0, 0.06], offset: 0 },
      { at: [5, 0.08], offset: -2.5 },
      { at: [10, 0.12], offset: 0 },
    ],
    ramps: [],
    palette: {
      lamp: '#f2f6ff',
      lamp2: '#ffcf8a',
      primary: '#ffcc33',
      secondary: '#e9eef7',
      accent: '#e8222b',
      warm: '#ffe6b0',
      sign: '#0f6b3a',
      skyTop: '#010205',
      skyHorizon: '#0b1322',
      skyGlow: '#2c3346',
      clouds: 0.45,
      stars: 0.35,
      fog: '#0e131c',
      fogDensity: 0.0032,
      ambient: '#252c3c',
      ground: '#050806',
      exposure: 1.0,
      tint: [1.0, 1.0, 1.02],
    },
  },
  {
    id: 'ring',
    name: 'METRO RING',
    tagline: 'A ring road through the harbour: over the bay, along the quay under the cranes and through the container yard.',
    theme: 'tunnel',
    difficulty: 1,
    width: 18,
    laps: 2,
    startOffset: 200,
    bankGain: 18,
    maxBank: 0.28,
    path: [
      ['S', 650], // 0 main straight
      ['R', 70, 220], // 1
      ['S', 400], // 2
      ['L', 35, 260], // 3 flat-out S
      ['R', 35, 260], // 4
      ['S', 500], // 5 out onto the bridge over the bay
      ['R', 150, 200], // 6 the Bowl: banked turnaround on the bridge, at the highest point
      ['S', 630], // 7 down to the quay
      ['L', 40, 240], // 8 onto the quay
      ['S', 300], // 9 along the quay, under the cranes
      ['R', 40, 240], // 10 into the container yard
      ['S', 400], // 11 through the yard, then up onto the expressway
      ['R', 80, 210], // 12 long sweeper
      ['S', 325], // 13
      ['R', 60, 280], // 14 last sweeper
    ],
    // the expressway 20 m over the city, up to 24 m on the bridge for the Bowl, down to the
    // ground along the quay and through the yard, and back up
    elevation: [
      [0.0, 20],
      [0.3, 21],
      [0.46, 24],
      [0.655, 0],
      [0.8, 0],
      [0.97, 20],
    ],
    sections: [
      { type: 'tunnel', from: [2, 0.2], to: [5, 0.4] },
      { type: 'open', from: [5, 0.4], to: [2, 0.2] },
      // over the bay, on the bridge
      { type: 'water', from: [6, 0.0], to: [6, 1.0] },
      // at ground level along the quay
      { type: 'quay', from: [9, 0.0], to: [9, 1.0] },
    ],
    // a container port the road drives through: the quay 18 m out from the road along it (the
    // road between the cranes' legs), the yard 320 m deep behind it with stacks lining the road
    // through it, the city beyond (see decor-harbour.js)
    harbour: { quayOffset: 18, reach: 200, yardDepth: 320 },
    // no corner is tight, so every long straight has room for a pad
    boostPads: [
      { at: [0, 0.06], offset: 0 },
      { at: [5, 0.08], offset: -2.5 },
      { at: [7, 0.08], offset: -2.5 },
      { at: [11, 0.08], offset: -2.5 },
    ],
    ramps: [],
    palette: {
      lamp: '#eef3ff',
      lamp2: '#ffc27e',
      primary: '#ffad4a',
      secondary: '#e9eef7',
      accent: '#ff3b2f',
      warm: '#ffcf8a',
      sign: '#0f6b3a',
      skyTop: '#010205',
      skyHorizon: '#0a1322',
      skyGlow: '#22304a',
      clouds: 0.55,
      stars: 0.18,
      fog: '#070b13',
      fogDensity: 0.002,
      ambient: '#1a2232',
      ground: '#030406',
      exposure: 1.0,
      tint: [1.0, 1.0, 1.03],
    },
  },
  {
    id: 'heights',
    name: 'UPTOWN HEIGHTS',
    tagline: 'Hillside streets after midnight. A blind crest jump and a hairpin in the old town.',
    theme: 'city',
    difficulty: 3,
    width: 16,
    laps: 3,
    startOffset: 200,
    bankGain: 4,
    maxBank: 0.1,
    path: [
      ['S', 650], // 0 main straight
      ['R', 90, 50], // 1 turn 1
      ['S', 300], // 2
      ['R', 90, 45], // 3 step block
      ['S', 120], // 4
      ['L', 90, 45], // 5
      ['S', 380], // 6 the climb
      ['R', 45, 90], // 7
      ['S', 260], // 8 crest jump
      ['R', 45, 90], // 9
      ['S', 60], // 10 downhill
      ['L', 25, 110], // 11 esses
      ['R', 25, 110], // 12
      ['S', 60], // 13
      ['R', 90, 55], // 14
      ['S', 300], // 15
      ['R', 90, 45], // 16 into the infield
      ['S', 160], // 17
      ['L', 180, 48], // 18 hairpin
      ['S', 160], // 19
      ['R', 90, 45], // 20
      ['S', 520], // 21 underpass
      ['R', 90, 50], // 22 last corner
    ],
    // a town on a 60 m hill: flat along the main straight, a gentle rise past turn 1, the climb up
    // to the crest (15% at its steepest, a San Francisco street), down through the esses (11%), a
    // switchback hairpin up the hill's flank and down through the underpass. Each keyframe is a
    // level spot (a smoothstep between them), so a long climb has as few as it can
    elevation: [
      [0.0, 0],
      [0.12, 0],
      [0.36, 16],
      [0.475, 62],
      [0.59, 30],
      [0.7, 12],
      [0.77, 20],
      [0.97, 0],
    ],
    // the ground is one hill under the roads, and the town on it steps down the slope
    hill: true,
    sections: [
      { type: 'city', from: 0, to: 0.999 },
      { type: 'tunnel', from: [21, 0.25], to: [21, 0.8] },
    ],
    // the straight after turn 14 is too short before the infield corner for a pad
    boostPads: [
      { at: [0, 0.06], offset: 0 },
      { at: [6, 0.1], offset: -2.5 },
      { at: [21, 0.1], offset: 0 },
    ],
    // on the crest, so the car flies off the top of the hill (1.3-1.4 s and 80-95 m in the air,
    // landing softly on the way down, either way round)
    ramps: [{ at: [8, 0.45], length: 24, height: 2.8, width: 10, offset: 0 }],
    palette: {
      lamp: '#ffb35c',
      lamp2: '#e4ecff',
      primary: '#ffad4a',
      secondary: '#e9eef7',
      accent: '#ff3b2f',
      warm: '#ffc98a',
      sign: '#0f6b3a',
      skyTop: '#010204',
      skyHorizon: '#0d1019',
      skyGlow: '#4f3520',
      clouds: 0.7,
      stars: 0.08,
      fog: '#0b0d13',
      fogDensity: 0.0028,
      ambient: '#1e2230',
      ground: '#050608',
      exposure: 1.0,
      tint: [1.0, 1.0, 1.02],
    },
  },
  {
    id: 'park',
    name: 'FLOODLIGHT PARK',
    tagline: 'A club circuit through a city park at night: through the woods round the hairpin, over a stone bridge and along the lake.',
    // a city park at night, modelled in Blender round the track (tools/blender/scenery/park.py);
    // the stadium sections only dress it if that can't be loaded
    theme: 'park',
    scenery: 'park',
    difficulty: 3,
    width: 14,
    laps: 3,
    startOffset: 200,
    bankGain: 6,
    maxBank: 0.12,
    path: [
      ['S', 480], // 0 main straight
      ['R', 90, 40], // 1 turn 1
      ['S', 140], // 2
      ['L', 60, 45], // 3 left-right flick
      ['R', 90, 35], // 4
      ['S', 400], // 5 back straight
      ['R', 45, 40], // 6 bus-stop chicane
      ['L', 90, 40], // 7
      ['R', 45, 40], // 8
      ['S', 220], // 9
      ['R', 160, 32], // 10 hairpin
      ['S', 300], // 11
      ['L', 90, 45], // 12 infield left
      ['R', 45, 70], // 13
      ['S', 220], // 14
      ['L', 40, 60], // 15 esses
      ['R', 40, 60], // 16
      ['S', 150], // 17
      ['R', 90, 40], // 18 tight right
      ['S', 150], // 19
      ['R', 35, 80], // 20 last corner
    ],
    elevation: [
      [0.0, 0],
      [0.2, 1],
      [0.28, 2],
      [0.45, 5],
      [0.56, 6],
      [0.7, 3],
      [0.82, 1],
      [0.92, 0],
    ],
    sections: [
      { type: 'stadium', from: [0, 0.0], to: [1, 0.5] },
      { type: 'stadium', from: [10, 0.0], to: [10, 1.0] },
      { type: 'stadium', from: [18, 0.0], to: [19, 1.0] },
    ],
    // every other straight ends in a tight corner too soon for a pad
    boostPads: [{ at: [0, 0.06], offset: 0 }],
    ramps: [],
    palette: {
      lamp: '#f2f6ff',
      lamp2: '#ffcf8a',
      primary: '#ffcc33',
      secondary: '#e9eef7',
      accent: '#e8222b',
      warm: '#ffe6b0',
      sign: '#0f6b3a',
      skyTop: '#010205',
      skyHorizon: '#0c1220',
      skyGlow: '#3a2a1e',
      clouds: 0.5,
      stars: 0.3,
      fog: '#0e131c',
      fogDensity: 0.0035,
      ambient: '#252c3c',
      ground: '#050806',
      exposure: 1.0,
      tint: [1.0, 1.0, 1.02],
    },
  },
];

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
