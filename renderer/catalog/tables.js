// @ts-check
/* 眼形播放列表、眨眼节奏、弹簧参数和视图配置。 */
function create() {
  /** @type {Record<string, number[]>} */
  const EYE_PLAYLIST = {
    sleeping: [13, 22, 4],
    dreaming: [13],
    waking: [13],
    idle: [0, 8],
    front: [25, 26],
    listening: [10, 1, 19],
    stretching: [4, 0],
    startled: [3, 21],
    quizzical: [0, 14],
    petting: [4, 19, 2],
    thinking: [8, 16, 14, 17, 5],
    searching: [15, 9, 3, 20, 12, 18],
    working: [7, 16, 11, 10],
    excited: [2, 17, 21, 3, 11],
    surprised: [3, 21],
    suspicious: [14, 5, 23],
    angry: [7, 16],
    drowsy: [4, 22, 13],
    happy: [2, 11, 17, 19],
    winking: [1],
    curious: [3, 21, 0, 15],
    confused: [14, 5, 8],
    bored: [4, 22, 0],
    proud: [15, 8, 2],
    shy: [0, 24, 13],
    sad: [4, 13, 22],
    laughing: [2, 11, 17],
    scared: [3, 21],
    playful: [2, 17, 11, 8],
    celebrate: [2, 8, 17],
    orbit: [0, 8],
    radar: [0, 8],
    spawning: [3, 0],
    humming: [0, 8],
    loading: [0, 8],
    dictating: [10, 1, 19],
    sending: [0, 8],
    receiving: [19, 0, 8],
    uploading: [15, 9, 8],
    writing: [15, 9],
    notifying: [3, 21, 0],
    alerting: [3, 21],
    bouncing: [2, 17],
    dragging: [3, 15, 0],
    "powering-down": [13, 22],
  };

  /** @type {Record<string, [number, number]>} */
  const EYE_HOLD_MS = {
    sleeping: [6000, 10000],
    dreaming: [8000, 8000],
    waking: [800, 800],
    idle: [9000, 16000],
    front: [8000, 8000],
    listening: [2800, 5000],
    stretching: [3500, 3500],
    startled: [800, 800],
    quizzical: [2200, 2200],
    petting: [3200, 5200],
    thinking: [2000, 3600],
    searching: [1000, 1800],
    working: [1800, 3200],
    excited: [1100, 2000],
    surprised: [2500, 4000],
    suspicious: [2600, 4500],
    angry: [2200, 3800],
    drowsy: [4000, 8000],
    happy: [2500, 4500],
    winking: [4000, 4000],
    curious: [1800, 3200],
    confused: [2200, 3800],
    bored: [3500, 6000],
    proud: [3500, 6000],
    shy: [3000, 5500],
    sad: [4000, 7000],
    laughing: [1200, 2400],
    scared: [900, 1800],
    playful: [1500, 3000],
    celebrate: [1400, 2600],
    orbit: [4000, 8000],
    radar: [4000, 8000],
    spawning: [1200, 1200],
    humming: [5000, 9000],
    loading: [6000, 10000],
    dictating: [4000, 8000],
    sending: [4000, 8000],
    receiving: [4000, 8000],
    uploading: [4000, 8000],
    writing: [4000, 8000],
    notifying: [1500, 2600],
    alerting: [2000, 3600],
    bouncing: [3000, 6000],
    dragging: [1600, 3000],
    "powering-down": [6000, 9000],
  };

  /** @type {Record<string, [number, number] | null>} */
  const BLINK_MS = {
    sleeping: null,
    dreaming: null,
    waking: null,
    idle: [6000, 14000],
    front: [7000, 12_000],
    listening: [3000, 7000],
    stretching: null,
    startled: null,
    quizzical: null,
    petting: [4500, 8000],
    thinking: [3500, 7000],
    searching: [1600, 4000],
    working: [2800, 5500],
    excited: [2000, 4000],
    surprised: [1800, 3500],
    suspicious: [4500, 8000],
    angry: [3500, 7000],
    drowsy: null,
    happy: [2500, 5000],
    winking: null,
    curious: [2500, 5500],
    confused: [2800, 5500],
    bored: [4000, 8000],
    proud: [3500, 7000],
    shy: [3000, 6000],
    sad: [4000, 8000],
    laughing: [2500, 5000],
    scared: [1200, 3000],
    playful: [2000, 4500],
    celebrate: [2200, 4500],
    orbit: null,
    radar: null,
    spawning: null,
    humming: [4000, 8000],
    loading: null,
    dictating: null,
    sending: null,
    receiving: null,
    uploading: null,
    writing: null,
    notifying: [2000, 4000],
    alerting: null,
    bouncing: null,
    dragging: [2200, 4500],
    "powering-down": null,
  };

  const THINKING_ALT = Object.freeze({
    cycleMs: 1200,
    dotStarts: Object.freeze([0, 1 / 3, 2 / 3]),
    dotDuration: 0.86,
    mergeAt: 0.54,
    absorbAt: 0.76,
  });

  /** @type {import("../types.js").RuntimeTables["SPRINGS"]} */
  const SPRINGS = {
    spin: [5, 0.9],
    x: [3.5, 1],
    y: [4, 1],
    squash: [10, 0.8],
    blink: [26, 1],
    eyeScale: [9, 0.85],
    front: [8, 1],
    gazeX: [13, 1],
    gazeY: [13, 1],
    notify: [9, 0.55],
    humDots: [6, 1],
    visual: [14, 1],
    visualMix: [11, 1],
    shape: [10, 1],
    formTurn: [14, 1],
    spinTurn: [6.2, 1],
  };

  const FACE_TUNE = {
    size: 0.86,
    gap: 1.18,
    height: 1,
    eyeWidth: 0.96,
    eyeHeight: 0.92,
  };
  const POSE = { turn: 17, tilt: -14, roll: 29, scale: 1 };
  const POSE_HOME = { turn: 33, tilt: -19, roll: 38 };
  const WINK_STATES = new Set([
    "idle",
    "happy",
    "excited",
    "curious",
    "playful",
  ]);
  /** @type {Readonly<Record<string, number>>} */
  const SHAPE_ZOOM = {
    blob: 0.92,
    pebble: 0.96,
    squircle: 0.84,
    tablet: 1,
    wedge: 0.94,
    hex: 0.94,
    cloud: 1,
    teardrop: 1,
  };
  const VIEW_SCALE = 259 / 229;
  /** @param {string} name */
  const shapeZoom = (name) => SHAPE_ZOOM[name] ?? 1;
  /** @param {string} name */
  const poseScale = (name) => shapeZoom(name) * VIEW_SCALE;
  /** @param {string} name */
  const shapeEyeScale = (name) => (SHAPE_ZOOM.blob ?? 1) / shapeZoom(name);
  const VIEW = { minX: -15, minY: -15, width: 259, height: 259 };
  const VIEW_HALF = VIEW.width / 2;
  const VIEW_MID = VIEW.minX + VIEW_HALF;
  return Object.freeze({
    EYE_PLAYLIST,
    EYE_HOLD_MS,
    BLINK_MS,
    THINKING_ALT,
    SPRINGS,
    FACE_TUNE,
    POSE,
    POSE_HOME,
    WINK_STATES,
    poseScale,
    shapeEyeScale,
    VIEW_HALF,
    VIEW_MID,
  });
}

export { create };
