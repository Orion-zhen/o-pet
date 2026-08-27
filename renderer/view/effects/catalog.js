// @ts-check
/* 视觉特效定义目录及其资源注册表。 */
import { create as createRegistry } from "../../catalog/registry.js";
import { create as createBall } from "./ball.js";
import { create as createBang } from "./bang.js";
import { create as createGather } from "./gather.js";
import { create as createOrbit } from "./orbit.js";
import { create as createPencil } from "./pencil.js";
import { create as createRadar } from "./radar.js";
import { create as createStandby } from "./standby.js";
import { create as createThinking } from "./thinking.js";
import { create as createTransfer } from "./transfer.js";
import { create as createWave } from "./wave.js";
import { create as createWhirl } from "./whirl.js";

const FORM_MORPH_THRESHOLD = 0.62;
const CYCLE_OFF = 1500;

/**
 * @param {{ data: import("../../types.js").GeometryData, math: import("../../types.js").MathPort, tables: import("../../types.js").RuntimeTables }} dependencies
 */
function create(dependencies) {
  const thinking = createThinking(dependencies);
  /** @type {import("./contracts.js").EffectDefinition[]} */
  const ordered = [
    ...thinking.definitions,
    createOrbit(dependencies),
    createRadar(dependencies),
    createGather(dependencies),
    createWave(dependencies),
    ...createTransfer(dependencies),
    createBall(dependencies),
    createWhirl(),
    createPencil(dependencies),
    createBang(dependencies),
    createStandby(dependencies),
  ];
  /** @type {Record<string, import("./contracts.js").EffectDefinition>} */
  const definitions = {};
  for (const definition of ordered) {
    if (definition.id in definitions)
      throw new Error(`重复视觉特效定义: ${definition.id}`);
    definitions[definition.id] = definition;
  }
  const formValues = ordered
    .filter((definition) => definition.radius !== undefined)
    .map((definition) => definition.id);
  const cameraValues = ordered
    .filter((definition) => definition.cameraZoom !== undefined)
    .map((definition) => definition.id);
  const cycleDefinitions = ordered.filter(
    (definition) => definition.cycleOn !== undefined,
  );
  const cycles = new Set(cycleDefinitions.map(({ id }) => id));
  /** @type {Record<string, number>} */
  const cycleOn = {};
  for (const definition of cycleDefinitions) {
    if (definition.cycleOn !== undefined)
      cycleOn[definition.id] = definition.cycleOn;
  }
  const preserveInk = new Set(
    ordered.filter(({ usesInk }) => usesInk === true).map(({ id }) => id),
  );
  const cameraZoom = Object.fromEntries(
    ordered.flatMap((definition) =>
      definition.cameraZoom === undefined
        ? []
        : [[definition.id, definition.cameraZoom]],
    ),
  );
  /** @param {string | null} current @param {string | null} previous @param {number} mix */
  function radiusFor(current, previous, mix) {
    if (current === null) return 19;
    const currentRadius = definitions[current]?.radius;
    if (currentRadius === undefined) return 19;
    const previousRadius =
      previous === null ? currentRadius : definitions[previous]?.radius;
    if (previousRadius === undefined) return currentRadius;
    return currentRadius * mix + previousRadius * (1 - mix);
  }

  /** @param {string | null} kind @param {number} scale */
  function cameraZoomFor(kind, scale) {
    if (kind === null) return 1;
    const zoom = cameraZoom[kind];
    if (zoom === undefined) throw new Error(`未知相机特效: ${kind}`);
    return Math.max(zoom / Math.max(scale, 1), 1);
  }

  return Object.freeze({
    CYCLE: cycles,
    CYCLE_OFF,
    CYCLE_ON: Object.freeze(cycleOn),
    FORM_MORPH_THRESHOLD,
    PRESERVE_INK: preserveInk,
    cameraZoomFor,
    definitions: Object.freeze(definitions),
    ordered: Object.freeze(ordered),
    radiusFor,
    registries: Object.freeze({
      form: createRegistry("form", formValues),
      decoration: createRegistry("decoration", [
        ...ordered.map(({ id }) => id),
        "hum-dots",
      ]),
      camera: createRegistry("camera", cameraValues),
    }),
    thoughtBumps: thinking.thoughtBumps,
  });
}

export { create };
