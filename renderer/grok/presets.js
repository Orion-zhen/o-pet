/* 正交通道预设。控制器只声明一个通道，场景与特效配方只负责组合。 */
(function (g) {
  const CHANNELS = Object.freeze([
    "motion",
    "face",
    "expression",
    "gaze",
    "form",
    "decoration",
    "particles",
    "camera",
    "badge",
  ]);
  const EFFECT_CHANNELS = Object.freeze(["form", "decoration", "particles", "camera", "badge"]);

  const control = (channel, id, params = null) => Object.freeze({ channel, id, params });
  const motion = (id, params) => control("motion", id, params);
  const face = (id, params) => control("face", id, params);
  const expression = (id, params) => control("expression", id, params);
  const gaze = (id, params) => control("gaze", id, params);
  const form = (id, params) => control("form", id, params);
  const decoration = (id, params) => control("decoration", id, params);
  const particles = (id, params) => control("particles", id, params);
  const camera = (id, params) => control("camera", id, params);
  const badge = (id, params) => control("badge", id, params);

  const EMPTY_EFFECT = Object.freeze({
    form: null,
    decoration: null,
    particles: null,
    camera: null,
    badge: null,
  });
  const effectRecipe = (formId, options = {}) => Object.freeze({
    form: formId,
    decoration: options.decoration === undefined ? formId : options.decoration,
    particles: options.particles ?? null,
    camera: options.camera === undefined ? formId : options.camera,
    badge: options.badge ?? null,
  });
  const EFFECTS = Object.freeze({
    thinking: effectRecipe("dots"),
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
    humming: effectRecipe(null, { decoration: "hum-dots", particles: "wide-spin-belts", camera: null }),
    notifying: effectRecipe(null, { decoration: null, camera: null, badge: "notification" }),
  });

  const controlsForEffect = (effectId) => {
    const recipe = effectId === null ? EMPTY_EFFECT : EFFECTS[effectId] ?? EMPTY_EFFECT;
    return [
      form(recipe.form),
      decoration(recipe.decoration),
      particles(recipe.particles),
      camera(recipe.camera),
      badge(recipe.badge),
    ];
  };

  function compose(id, controls, metadata = {}) {
    const channels = {};
    for (const controller of controls) {
      if (!controller || !CHANNELS.includes(controller.channel)) throw new Error(`无效动画控制器: ${id}`);
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
    return Object.freeze({ id, channels: Object.freeze(channels), ...metadata });
  }

  const scene = (id, motionId, expressionId = motionId, effectId = motionId, gazeId = expressionId) => compose(
    id,
    [
      motion(motionId),
      face(motionId),
      expression(expressionId),
      gaze(gazeId),
      ...controlsForEffect(effectId),
    ],
    { effectId },
  );

  const scenes = Object.freeze({
    spawning: scene("spawning", "spawning"),
    waking: scene("waking", "waking"),
    idle: scene("idle", "idle", "idle", null, "idle"),
    sleeping: scene("sleeping", "sleeping"),
    drowsy: scene("drowsy", "drowsy", "drowsy", null, "drowsy"),
    dreaming: scene("dreaming", "dreaming", "sleeping", null, "sleeping"),
    stretching: scene("stretching", "stretching", "drowsy", null, "idle"),
    startled: scene("startled", "startled", "startled", null, "startled"),
    quizzical: scene("quizzical", "quizzical", "quizzical", null, "front"),
    dragging: scene("dragging", "dragging"),
    frontAttention: scene("frontAttention", "listening", "curious", null, "front"),
    sleepyCurious: scene("sleepyCurious", "curious", "drowsy", null, "drowsy"),
    bored: scene("bored", "bored", "bored", null, "bored"),
    playful: scene("playful", "playful", "playful", null, "playful"),
    jumping: scene("jumping", "playful", "happy", null, "playful"),
    gazeListening: scene("gazeListening", "idle", "listening", null, "listening"),
    gazeSearching: scene("gazeSearching", "idle", "idle", null, "searching"),
    gazeCurious: scene("gazeCurious", "idle", "curious", null, "curious"),
    listening: scene("listening", "listening", "listening", null, "listening"),
    curious: scene("curious", "curious", "curious", null, "curious"),
    thinking: scene("thinking", "thinking", "thinking", null, "thinking"),
    deepThinking: scene("deepThinking", "thinking", "curious", "thinking", "thinking"),
    humming: scene("humming", "humming", "thinking", "humming", "thinking"),
    radar: scene("radar", "thinking", "searching", "radar", "searching"),
    searching: scene("searching", "searching", "searching", null, "searching"),
    coding: scene("coding", "working", "working", "writing", "working"),
    reviewing: scene("reviewing", "thinking", "searching", null, "working"),
    terminalTyping: scene("terminalTyping", "working", "working", null, "working"),
    loading: scene("loading", "working", "working", "loading", "working"),
    receiving: scene("receiving", "working", "curious", "receiving", "searching"),
    consulting: scene("consulting", "thinking", "curious", "orbit", "thinking"),
    tooling: scene("tooling", "working", "working", "orbit", "working"),
    replying: scene("replying", "listening", "listening", "dictating", "listening"),
    sending: scene("sending", "working", "happy", "sending", "notifying"),
    alerting: scene("alerting", "alerting"),
    notifying: scene("notifying", "notifying"),
    happy: scene("happy", "happy", "happy", null, "happy"),
    quickHappy: scene("quickHappy", "happy", "winking", null, "happy"),
    shy: scene("shy", "shy", "shy", null, "shy"),
    surprised: scene("surprised", "surprised", "surprised", null, "surprised"),
    confused: scene("confused", "confused", "confused", null, "confused"),
    angry: scene("angry", "angry", "angry", null, "angry"),
    proud: scene("proud", "proud", "proud", null, "proud"),
    celebrate: scene("celebrate", "celebrate"),
    sad: scene("sad", "sad", "sad", null, "sad"),
  });

  const fromState = (state) => scene(`state:${state}`, state);

  function withDetails(preset, details) {
    return Object.freeze({ preset, ...details });
  }

  function replaceChannels(base, replacement, channelNames) {
    const channels = { ...base.channels };
    for (const channel of channelNames) channels[channel] = replacement.channels[channel];
    const replacesEffect = channelNames.some((channel) => EFFECT_CHANNELS.includes(channel));
    return Object.freeze({
      id: `${base.id}+${replacement.id}`,
      channels: Object.freeze(channels),
      effectId: replacesEffect ? replacement.effectId : base.effectId,
    });
  }

  function resolve(value) {
    const preset = value?.preset ?? value;
    if (!preset?.channels) return null;
    const details = value?.preset ? value : null;
    return Object.freeze({
      motion: preset.channels.motion.id,
      face: preset.channels.face.id,
      expression: preset.channels.expression.id,
      gaze: preset.channels.gaze.id,
      form: preset.channels.form.id,
      decoration: preset.channels.decoration.id,
      particles: preset.channels.particles.id,
      camera: preset.channels.camera.id,
      badge: preset.channels.badge.id,
      effect: preset.effectId ?? null,
      direction: details?.direction,
      variant: details?.variant,
    });
  }

  g.GROK_PRESETS = Object.freeze({
    CHANNELS,
    EFFECT_CHANNELS,
    EFFECTS,
    control,
    motion,
    face,
    expression,
    gaze,
    form,
    decoration,
    particles,
    camera,
    badge,
    compose,
    scene,
    scenes,
    fromState,
    withDetails,
    replaceChannels,
    resolve,
  });
})(window);
