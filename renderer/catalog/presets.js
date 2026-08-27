// @ts-check
/* 正交通道预设。控制器只声明一个通道，场景与特效配方只负责组合。 */
/** @type {readonly import("../types.js").ChannelName[]} */
const CHANNELS = Object.freeze([
  "motion",
  "face",
  "expression",
  "gaze",
  "shape",
  "form",
  "decoration",
  "particles",
  "camera",
  "badge",
]);
/**
 * @param {import("../types.js").ChannelName} channel
 * @param {string | null} id
 * @returns {import("../types.js").Control}
 */
const control = (channel, id) => Object.freeze({ channel, id });
/** @param {string} id */
const motion = (id) => control("motion", id);
/** @param {string} id */
const face = (id) => control("face", id);
/** @param {string} id */
const expression = (id) => control("expression", id);
/** @param {string} id */
const gaze = (id) => control("gaze", id);
/** @param {string | null} id */
const shape = (id) => control("shape", id);
/** @param {string | null} id */
const form = (id) => control("form", id);
/** @param {string | null} id */
const decoration = (id) => control("decoration", id);
/** @param {string | null} id */
const particles = (id) => control("particles", id);
/** @param {string | null} id */
const camera = (id) => control("camera", id);
/** @param {string | null} id */
const badge = (id) => control("badge", id);

/** @type {Readonly<import("../types.js").EffectRecipe>} */
const EMPTY_EFFECT = Object.freeze({
  form: null,
  decoration: null,
  particles: null,
  camera: null,
  badge: null,
});
/**
 * @param {string | null} formId
 * @param {Partial<import("../types.js").EffectRecipe>} [options]
 * @returns {Readonly<import("../types.js").EffectRecipe>}
 */
const effectRecipe = (formId, options = {}) =>
  Object.freeze({
    form: formId,
    decoration:
      options.decoration === undefined ? formId : options.decoration,
    particles: options.particles ?? null,
    camera: options.camera === undefined ? formId : options.camera,
    badge: options.badge ?? null,
  });
/** @type {Readonly<Record<string, Readonly<import("../types.js").EffectRecipe>>>} */
const EFFECTS = Object.freeze({
  thinking: effectRecipe("dots"),
  "thinking-alt": effectRecipe(null, {
    decoration: "thought-pulse",
    camera: null,
  }),
  orbit: effectRecipe("orbit"),
  radar: effectRecipe("radar"),
  spawning: effectRecipe("gather"),
  dictating: effectRecipe("wave"),
  sending: effectRecipe("send"),
  receiving: effectRecipe("receive"),
  uploading: effectRecipe("dock"),
  bouncing: effectRecipe("ball"),
  loading: effectRecipe("whirl", { particles: "spin-belts" }),
  "powering-down": effectRecipe("standby"),
  writing: effectRecipe("pencil"),
  alerting: effectRecipe("bang"),
  humming: effectRecipe(null, {
    decoration: "hum-dots",
    particles: "wide-spin-belts",
    camera: null,
  }),
  notifying: effectRecipe(null, {
    decoration: null,
    camera: null,
    badge: "notification",
  }),
});

/**
 * @param {import("../types.js").Preset} preset
 * @param {string} choreography
 * @returns {import("../types.js").Preset}
 */
const withChoreography = (preset, choreography) =>
  Object.freeze({ ...preset, choreography });

/**
 * @param {string | null} effectId
 * @returns {import("../types.js").Control[]}
 */
const controlsForEffect = (effectId) => {
  const recipe =
    effectId === null ? EMPTY_EFFECT : (EFFECTS[effectId] ?? EMPTY_EFFECT);
  return [
    form(recipe.form),
    decoration(recipe.decoration),
    particles(recipe.particles),
    camera(recipe.camera),
    badge(recipe.badge),
  ];
};

/**
 * @param {string} id
 * @param {readonly import("../types.js").Control[]} controls
 * @returns {import("../types.js").Preset}
 */
function compose(id, controls) {
  /** @type {Partial<Record<import("../types.js").ChannelName, import("../types.js").Control>>} */
  const channels = {};
  for (const controller of controls) {
    if (!controller || !CHANNELS.includes(controller.channel))
      throw new Error(`无效动画控制器: ${id}`);
    if (Object.prototype.hasOwnProperty.call(channels, controller.channel)) {
      throw new Error(`动画预设 ${id} 重复声明 ${controller.channel}`);
    }
    channels[controller.channel] = controller;
  }
  for (const channel of CHANNELS) {
    if (!Object.prototype.hasOwnProperty.call(channels, channel)) {
      throw new Error(`动画预设 ${id} 缺少 ${channel}`);
    }
  }
  return Object.freeze({
    id,
    channels: Object.freeze(
      /** @type {Record<import("../types.js").ChannelName, import("../types.js").Control>} */ (channels),
    ),
  });
}

/**
 * @param {string} id
 * @param {string} motionId
 * @param {string} [expressionId]
 * @param {string | null} [effectId]
 * @param {string} [gazeId]
 * @param {string | null} [shapeId]
 * @returns {import("../types.js").Preset}
 */
const scene = (
  id,
  motionId,
  expressionId = motionId,
  effectId = motionId,
  gazeId = expressionId,
  shapeId = null,
) =>
  compose(id, [
    motion(motionId),
    face(motionId),
    expression(expressionId),
    gaze(gazeId),
    shape(shapeId),
    ...controlsForEffect(effectId),
  ]);

const scenes = Object.freeze({
  spawning: scene("spawning", "spawning"),
  waking: withChoreography(scene("waking", "waking"), "waking"),
  idle: scene("idle", "idle", "idle", null, "idle"),
  sleeping: scene("sleeping", "sleeping"),
  drowsy: scene("drowsy", "drowsy", "drowsy", null, "drowsy"),
  dreaming: scene("dreaming", "dreaming", "sleeping", null, "sleeping"),
  stretching: scene("stretching", "stretching", "drowsy", null, "idle"),
  startled: scene("startled", "startled", "startled", null, "startled"),
  quizzical: scene("quizzical", "quizzical", "quizzical", null, "front"),
  dragging: scene("dragging", "dragging"),
  front: scene("front", "listening", "front", null, "front"),
  sleepyCurious: scene("sleepyCurious", "curious", "drowsy", null, "drowsy"),
  bored: scene("bored", "bored", "bored", null, "bored"),
  playful: withChoreography(
    scene("playful", "playful", "playful", null, "playful"),
    "playful",
  ),
  jumping: scene("jumping", "playful", "happy", null, "playful"),
  gazeListening: scene(
    "gazeListening",
    "idle",
    "listening",
    null,
    "listening",
  ),
  gazeSearching: scene("gazeSearching", "idle", "idle", null, "searching"),
  gazeCurious: scene("gazeCurious", "idle", "curious", null, "curious"),
  listening: scene("listening", "listening", "listening", null, "listening"),
  curious: scene("curious", "curious", "curious", null, "curious"),
  thinking: scene("thinking", "thinking", "thinking", null, "thinking"),
  "thinking-alt": scene(
    "thinking-alt",
    "thinking-alt",
    "thinking",
    "thinking-alt",
    "thinking",
    "cloud",
  ),
  deepThinking: scene(
    "deepThinking",
    "thinking",
    "curious",
    "thinking",
    "thinking",
  ),
  humming: scene("humming", "humming", "thinking", "humming", "thinking"),
  radar: scene("radar", "thinking", "searching", "radar", "searching"),
  searching: scene("searching", "searching", "searching", null, "searching"),
  coding: scene("coding", "working", "working", "writing", "working"),
  reviewing: scene("reviewing", "thinking", "searching", null, "working"),
  terminalTyping: scene(
    "terminalTyping",
    "working",
    "working",
    null,
    "working",
  ),
  loading: scene("loading", "working", "working", "loading", "working"),
  receiving: scene(
    "receiving",
    "working",
    "curious",
    "receiving",
    "searching",
  ),
  consulting: scene("consulting", "thinking", "curious", "orbit", "thinking"),
  tooling: scene("tooling", "working", "working", "orbit", "working"),
  replying: scene(
    "replying",
    "listening",
    "listening",
    "dictating",
    "listening",
  ),
  sending: scene("sending", "working", "happy", "sending", "notifying"),
  alerting: scene("alerting", "alerting"),
  notifying: scene("notifying", "notifying"),
  happy: withChoreography(
    scene("happy", "happy", "happy", null, "happy"),
    "happy",
  ),
  quickHappy: scene("quickHappy", "happy", "winking", null, "happy"),
  shy: scene("shy", "shy", "shy", null, "shy"),
  surprised: scene("surprised", "surprised", "surprised", null, "surprised"),
  confused: scene("confused", "confused", "confused", null, "confused"),
  angry: scene("angry", "angry", "angry", null, "angry"),
  proud: withChoreography(
    scene("proud", "proud", "proud", null, "proud"),
    "proud",
  ),
  celebrate: scene("celebrate", "celebrate"),
  sad: scene("sad", "sad", "sad", null, "sad"),
});

/** @type {Readonly<Record<string, import("../types.js").Preset>>} */
const scenesById = scenes;

/** @param {string} state @returns {import("../types.js").Preset} */
const fromState = (state) => scenesById[state] ?? scene(`state:${state}`, state);

/**
 * @param {import("../types.js").Preset} preset
 * @param {import("../types.js").SceneDetails} details
 * @returns {import("../types.js").DetailedPreset}
 */
function withDetails(preset, details) {
  return Object.freeze({ preset, ...details });
}

/**
 * @param {import("../types.js").Preset} base
 * @param {import("../types.js").Preset} replacement
 * @param {readonly import("../types.js").ChannelName[]} channelNames
 * @returns {import("../types.js").Preset}
 */
function replaceChannels(base, replacement, channelNames) {
  const channels = { ...base.channels };
  for (const channel of channelNames)
    channels[channel] = replacement.channels[channel];
  return Object.freeze({
    id: `${base.id}+${replacement.id}`,
    channels: Object.freeze(channels),
    choreography: channelNames.includes("motion")
      ? (replacement.choreography ?? null)
      : (base.choreography ?? null),
  });
}

/**
 * @param {import("../types.js").Scene} value
 * @returns {import("../types.js").ResolvedScene}
 */
function resolve(value) {
  const details = "preset" in value ? value : null;
  const preset = "preset" in value ? value.preset : value;
  /** @param {"motion" | "face" | "expression" | "gaze"} channel */
  const required = (channel) => {
    const id = preset.channels[channel].id;
    if (id === null) throw new Error(`动画预设 ${preset.id} 的 ${channel} 不能为空`);
    return id;
  };
  return Object.freeze({
    motion: required("motion"),
    face: required("face"),
    expression: required("expression"),
    gaze: required("gaze"),
    shape: preset.channels.shape.id,
    form: preset.channels.form.id,
    decoration: preset.channels.decoration.id,
    particles: preset.channels.particles.id,
    camera: preset.channels.camera.id,
    badge: preset.channels.badge.id,
    choreography: preset.choreography ?? null,
    ...(details?.direction === undefined ? {} : { direction: details.direction }),
    ...(details?.variant === undefined ? {} : { variant: details.variant }),
  });
}

export { scenes, fromState, withDetails, replaceChannels, resolve };
