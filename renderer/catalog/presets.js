// @ts-check
/* 正交通道预设。场景显式组合控制器，控制器注册表负责校验引用。 */
import { create as createRegistry } from "./registry.js";

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

/** @type {Readonly<import("../types.js").EffectRecipe>} */
const EMPTY_EFFECT = Object.freeze({
  form: null,
  decoration: null,
  particles: null,
  camera: null,
  badge: null,
});

/**
 * @param {string | null} form
 * @param {Partial<import("../types.js").EffectRecipe>} [options]
 * @returns {Readonly<import("../types.js").EffectRecipe>}
 */
const effectRecipe = (form, options = {}) =>
  Object.freeze({
    form,
    decoration: options.decoration === undefined ? form : options.decoration,
    particles: options.particles ?? null,
    camera: options.camera === undefined ? form : options.camera,
    badge: options.badge ?? null,
  });

/** @type {Readonly<Record<string, Readonly<import("../types.js").EffectRecipe>>>} */
const effects = Object.freeze({
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
  notifying: effectRecipe(null, { badge: "notification", camera: null }),
});
const effectRegistry = createRegistry("effect recipe", Object.keys(effects));

/**
 * @param {string} id
 * @param {readonly import("../types.js").Control[]} controls
 * @param {string | null} choreography
 * @returns {import("../types.js").Preset}
 */
function compose(id, controls, choreography) {
  /** @type {Partial<Record<import("../types.js").ChannelName, import("../types.js").Control>>} */
  const channels = {};
  for (const controller of controls) {
    if (!CHANNELS.includes(controller.channel))
      throw new Error(`无效动画控制器: ${id}`);
    if (Object.prototype.hasOwnProperty.call(channels, controller.channel))
      throw new Error(`动画预设 ${id} 重复声明 ${controller.channel}`);
    channels[controller.channel] = controller;
  }
  for (const channel of CHANNELS) {
    if (!Object.prototype.hasOwnProperty.call(channels, channel))
      throw new Error(`动画预设 ${id} 缺少 ${channel}`);
  }
  return Object.freeze({
    id,
    channels: Object.freeze(
      /** @type {Record<import("../types.js").ChannelName, import("../types.js").Control>} */ (channels),
    ),
    ...(choreography === null ? {} : { choreography }),
  });
}

/**
 * @param {string} id
 * @param {import("../types.js").SceneDefinition} definition
 * @returns {import("../types.js").Preset}
 */
function defineScene(id, definition) {
  const effectId = definition.effect ?? null;
  if (effectId !== null && !effectRegistry.has(effectId))
    throw new Error(`动画预设 ${id} 引用了未知 effect recipe: ${effectId}`);
  const effect = effectId === null ? EMPTY_EFFECT : effects[effectId];
  if (effect === undefined)
    throw new Error(`动画预设 ${id} 缺少 effect recipe: ${effectId}`);
  return compose(
    id,
    [
      control("motion", definition.motion),
      control("face", definition.face),
      control("expression", definition.expression),
      control("gaze", definition.gaze),
      control("shape", definition.shape ?? null),
      control("form", effect.form),
      control("decoration", effect.decoration),
      control("particles", effect.particles),
      control("camera", effect.camera),
      control("badge", effect.badge),
    ],
    definition.choreography ?? null,
  );
}

const scenes = Object.freeze({
  spawning: defineScene("spawning", {
    motion: "spawning",
    face: "spawning",
    expression: "spawning",
    gaze: "spawning",
    effect: "spawning",
  }),
  waking: defineScene("waking", {
    motion: "waking",
    face: "waking",
    expression: "waking",
    gaze: "waking",
    choreography: "waking",
  }),
  idle: defineScene("idle", {
    motion: "idle",
    face: "idle",
    expression: "idle",
    gaze: "idle",
  }),
  sleeping: defineScene("sleeping", {
    motion: "sleeping",
    face: "sleeping",
    expression: "sleeping",
    gaze: "sleeping",
  }),
  drowsy: defineScene("drowsy", {
    motion: "drowsy",
    face: "drowsy",
    expression: "drowsy",
    gaze: "drowsy",
  }),
  dreaming: defineScene("dreaming", {
    motion: "dreaming",
    face: "dreaming",
    expression: "sleeping",
    gaze: "sleeping",
  }),
  stretching: defineScene("stretching", {
    motion: "stretching",
    face: "stretching",
    expression: "drowsy",
    gaze: "idle",
  }),
  startled: defineScene("startled", {
    motion: "startled",
    face: "startled",
    expression: "startled",
    gaze: "startled",
  }),
  quizzical: defineScene("quizzical", {
    motion: "quizzical",
    face: "quizzical",
    expression: "quizzical",
    gaze: "front",
  }),
  dragging: defineScene("dragging", {
    motion: "dragging",
    face: "dragging",
    expression: "dragging",
    gaze: "dragging",
  }),
  front: defineScene("front", {
    motion: "listening",
    face: "listening",
    expression: "front",
    gaze: "front",
  }),
  sleepyCurious: defineScene("sleepyCurious", {
    motion: "curious",
    face: "curious",
    expression: "drowsy",
    gaze: "drowsy",
  }),
  bored: defineScene("bored", {
    motion: "bored",
    face: "bored",
    expression: "bored",
    gaze: "bored",
  }),
  playful: defineScene("playful", {
    motion: "playful",
    face: "playful",
    expression: "playful",
    gaze: "playful",
    choreography: "playful",
  }),
  jumping: defineScene("jumping", {
    motion: "playful",
    face: "playful",
    expression: "happy",
    gaze: "playful",
  }),
  gazeListening: defineScene("gazeListening", {
    motion: "idle",
    face: "idle",
    expression: "listening",
    gaze: "listening",
  }),
  gazeSearching: defineScene("gazeSearching", {
    motion: "idle",
    face: "idle",
    expression: "idle",
    gaze: "searching",
  }),
  gazeCurious: defineScene("gazeCurious", {
    motion: "idle",
    face: "idle",
    expression: "curious",
    gaze: "curious",
  }),
  listening: defineScene("listening", {
    motion: "listening",
    face: "listening",
    expression: "listening",
    gaze: "listening",
  }),
  curious: defineScene("curious", {
    motion: "curious",
    face: "curious",
    expression: "curious",
    gaze: "curious",
  }),
  thinking: defineScene("thinking", {
    motion: "thinking",
    face: "thinking",
    expression: "thinking",
    gaze: "thinking",
  }),
  "thinking-alt": defineScene("thinking-alt", {
    motion: "thinking-alt",
    face: "thinking-alt",
    expression: "thinking",
    gaze: "thinking",
    shape: "cloud",
    effect: "thinking-alt",
  }),
  deepThinking: defineScene("deepThinking", {
    motion: "thinking",
    face: "thinking",
    expression: "curious",
    gaze: "thinking",
    effect: "thinking",
  }),
  humming: defineScene("humming", {
    motion: "humming",
    face: "humming",
    expression: "thinking",
    gaze: "thinking",
    effect: "humming",
  }),
  radar: defineScene("radar", {
    motion: "thinking",
    face: "thinking",
    expression: "searching",
    gaze: "searching",
    effect: "radar",
  }),
  searching: defineScene("searching", {
    motion: "searching",
    face: "searching",
    expression: "searching",
    gaze: "searching",
  }),
  coding: defineScene("coding", {
    motion: "working",
    face: "working",
    expression: "working",
    gaze: "working",
    effect: "writing",
  }),
  reviewing: defineScene("reviewing", {
    motion: "thinking",
    face: "thinking",
    expression: "searching",
    gaze: "working",
  }),
  terminalTyping: defineScene("terminalTyping", {
    motion: "working",
    face: "working",
    expression: "working",
    gaze: "working",
  }),
  loading: defineScene("loading", {
    motion: "working",
    face: "working",
    expression: "working",
    gaze: "working",
    effect: "loading",
  }),
  receiving: defineScene("receiving", {
    motion: "working",
    face: "working",
    expression: "curious",
    gaze: "searching",
    effect: "receiving",
  }),
  consulting: defineScene("consulting", {
    motion: "thinking",
    face: "thinking",
    expression: "curious",
    gaze: "thinking",
    effect: "orbit",
  }),
  tooling: defineScene("tooling", {
    motion: "working",
    face: "working",
    expression: "working",
    gaze: "working",
    effect: "orbit",
  }),
  replying: defineScene("replying", {
    motion: "listening",
    face: "listening",
    expression: "listening",
    gaze: "listening",
    effect: "dictating",
  }),
  sending: defineScene("sending", {
    motion: "working",
    face: "working",
    expression: "happy",
    gaze: "notifying",
    effect: "sending",
  }),
  alerting: defineScene("alerting", {
    motion: "alerting",
    face: "alerting",
    expression: "alerting",
    gaze: "alerting",
    effect: "alerting",
  }),
  notifying: defineScene("notifying", {
    motion: "notifying",
    face: "notifying",
    expression: "notifying",
    gaze: "notifying",
    effect: "notifying",
  }),
  happy: defineScene("happy", {
    motion: "happy",
    face: "happy",
    expression: "happy",
    gaze: "happy",
    choreography: "happy",
  }),
  quickHappy: defineScene("quickHappy", {
    motion: "happy",
    face: "happy",
    expression: "winking",
    gaze: "happy",
  }),
  shy: defineScene("shy", {
    motion: "shy",
    face: "shy",
    expression: "shy",
    gaze: "shy",
  }),
  surprised: defineScene("surprised", {
    motion: "surprised",
    face: "surprised",
    expression: "surprised",
    gaze: "surprised",
  }),
  confused: defineScene("confused", {
    motion: "confused",
    face: "confused",
    expression: "confused",
    gaze: "confused",
  }),
  angry: defineScene("angry", {
    motion: "angry",
    face: "angry",
    expression: "angry",
    gaze: "angry",
  }),
  proud: defineScene("proud", {
    motion: "proud",
    face: "proud",
    expression: "proud",
    gaze: "proud",
    choreography: "proud",
  }),
  celebrate: defineScene("celebrate", {
    motion: "celebrate",
    face: "celebrate",
    expression: "celebrate",
    gaze: "celebrate",
  }),
  sad: defineScene("sad", {
    motion: "sad",
    face: "sad",
    expression: "sad",
    gaze: "sad",
  }),
});

/** @type {Readonly<Record<string, import("../types.js").Preset>>} */
const actions = Object.freeze({
  sleeping: scenes.sleeping,
  dreaming: scenes.dreaming,
  waking: scenes.waking,
  idle: scenes.idle,
  listening: scenes.listening,
  thinking: scenes.thinking,
  "thinking-alt": scenes["thinking-alt"],
  searching: scenes.searching,
  working: defineScene("action:working", {
    motion: "working",
    face: "working",
    expression: "working",
    gaze: "working",
  }),
  excited: defineScene("action:excited", {
    motion: "excited",
    face: "excited",
    expression: "excited",
    gaze: "excited",
  }),
  surprised: scenes.surprised,
  startled: scenes.startled,
  suspicious: defineScene("action:suspicious", {
    motion: "suspicious",
    face: "suspicious",
    expression: "suspicious",
    gaze: "suspicious",
  }),
  angry: scenes.angry,
  drowsy: scenes.drowsy,
  happy: scenes.happy,
  winking: defineScene("action:winking", {
    motion: "winking",
    face: "winking",
    expression: "winking",
    gaze: "winking",
  }),
  curious: scenes.curious,
  confused: scenes.confused,
  quizzical: scenes.quizzical,
  bored: scenes.bored,
  proud: scenes.proud,
  shy: scenes.shy,
  sad: scenes.sad,
  laughing: defineScene("action:laughing", {
    motion: "laughing",
    face: "laughing",
    expression: "laughing",
    gaze: "laughing",
  }),
  scared: defineScene("action:scared", {
    motion: "scared",
    face: "scared",
    expression: "scared",
    gaze: "scared",
  }),
  playful: scenes.playful,
  celebrate: scenes.celebrate,
  orbit: defineScene("action:orbit", {
    motion: "orbit",
    face: "orbit",
    expression: "orbit",
    gaze: "orbit",
    effect: "orbit",
  }),
  radar: scenes.radar,
  stretching: scenes.stretching,
  front: scenes.front,
  spawning: scenes.spawning,
  humming: scenes.humming,
  loading: scenes.loading,
  dictating: defineScene("action:dictating", {
    motion: "dictating",
    face: "dictating",
    expression: "dictating",
    gaze: "dictating",
    effect: "dictating",
  }),
  writing: defineScene("action:writing", {
    motion: "writing",
    face: "writing",
    expression: "writing",
    gaze: "writing",
    effect: "writing",
  }),
  sending: scenes.sending,
  receiving: scenes.receiving,
  uploading: defineScene("action:uploading", {
    motion: "uploading",
    face: "uploading",
    expression: "uploading",
    gaze: "uploading",
    effect: "uploading",
  }),
  notifying: scenes.notifying,
  alerting: scenes.alerting,
  dragging: scenes.dragging,
  bouncing: defineScene("action:bouncing", {
    motion: "bouncing",
    face: "bouncing",
    expression: "bouncing",
    gaze: "bouncing",
    effect: "bouncing",
  }),
  "powering-down": defineScene("action:powering-down", {
    motion: "powering-down",
    face: "powering-down",
    expression: "powering-down",
    gaze: "powering-down",
    effect: "powering-down",
  }),
});

/** @param {string} state @returns {import("../types.js").Preset} */
function fromState(state) {
  const preset = actions[state];
  if (preset === undefined) throw new Error(`未知动画动作: ${state}`);
  return preset;
}

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

export {
  actions,
  defineScene,
  effectRegistry,
  effects,
  fromState,
  replaceChannels,
  resolve,
  scenes,
  withDetails,
};
