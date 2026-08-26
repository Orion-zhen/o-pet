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
  const control = (channel, id) => Object.freeze({ channel, id });
  const motion = (id) => control("motion", id);
  const face = (id) => control("face", id);
  const expression = (id) => control("expression", id);
  const gaze = (id) => control("gaze", id);
  const form = (id) => control("form", id);
  const decoration = (id) => control("decoration", id);
  const particles = (id) => control("particles", id);
  const camera = (id) => control("camera", id);
  const badge = (id) => control("badge", id);

  const EMPTY_EFFECT = Object.freeze({
    form: null,
    decoration: null,
    particles: null,
    camera: null,
    badge: null,
  });
  const effectRecipe = (formId, options = {}) =>
    Object.freeze({
      form: formId,
      decoration:
        options.decoration === undefined ? formId : options.decoration,
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

  const withChoreography = (preset, choreography) =>
    Object.freeze({ ...preset, choreography });

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

  function compose(id, controls) {
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
    return Object.freeze({ id, channels: Object.freeze(channels) });
  }

  const scene = (
    id,
    motionId,
    expressionId = motionId,
    effectId = motionId,
    gazeId = expressionId,
  ) =>
    compose(id, [
      motion(motionId),
      face(motionId),
      expression(expressionId),
      gaze(gazeId),
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

  const fromState = (state) => scenes[state] ?? scene(`state:${state}`, state);

  function withDetails(preset, details) {
    return Object.freeze({ preset, ...details });
  }

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
      choreography: preset.choreography ?? null,
      direction: details?.direction,
      variant: details?.variant,
    });
  }

  g.OPET_PRESETS = Object.freeze({
    CHANNELS,
    scenes,
    fromState,
    withDetails,
    replaceChannels,
    resolve,
  });
})(globalThis[Symbol.for("o-pet.renderer")]);
