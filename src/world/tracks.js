// Circuit definitions. Paths use turtle commands:
//   ['S', length]            straight
//   ['L'|'R', degrees, radius] constant-radius corner
// Feature positions are either fractions of the loop or [commandIndex, fraction].

// Boost pads are switched off for now. Their positions stay below, so turning this back on
// restores them as they were.
export const BOOST_PADS_ON = false;

export const TRACKS = [
  {
    id: 'lumen',
    name: 'SKYLINE EXPRESSWAY',
    tagline: 'Elevated freeway and long tunnels above a sleeping city.',
    theme: 'tunnel',
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
];

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
