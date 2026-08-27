const MODULE_SCOPE = Symbol.for("o-pet.renderer");
const modules = Object.create(null);
Object.defineProperty(globalThis, MODULE_SCOPE, {
  configurable: true,
  value: modules,
});

try {
  for (const source of [
    "./view/geometry-data.js",
    "./engine/math.js",
    "./view/geometry.js",
    "./catalog/tables.js",
    "./catalog/presets.js",
    "./catalog/sequences.js",
    "./engine/channels/motion.js",
    "./engine/channels/expression.js",
    "./engine/channels/gaze.js",
    "./engine/channels/choreography.js",
    "./engine/actions.js",
    "./view/particles.js",
    "./view/effects.js",
    "./view/eyes.js",
    "./view/svg.js",
    "./engine/visual-channels.js",
    "./engine/runtime.js",
    "./runtime/scheduler.js",
    "./runtime/timeline.js",
    "./runtime/presenter.js",
    "./behaviors/activities.js",
    "./behaviors/idle.js",
    "./behaviors/cues.js",
    "./behaviors/interaction.js",
    "./adapters/pointer.js",
    "./adapters/preferences.js",
    "./host.js",
    "./start.js",
  ]) {
    await import(source);
  }
} finally {
  delete globalThis[MODULE_SCOPE];
}
