// @ts-check
/* OPet 数值内核：标量、缓动、弹簧和姿态矩阵。 */
/** @param {number} x @returns {import("../types.js").Spring} */
const spring = (x) => ({ x, v: 0, t: x });
/** @param {import("../types.js").Spring} state @param {number} frequency @param {number} damping @param {number} dt */
const stepSpring = (state, frequency, damping, dt) => {
  state.v +=
    (-2 * damping * frequency * state.v -
      frequency * frequency * (state.x - state.t)) *
    dt;
  state.x += state.v * dt;
};
const DT = 1 / 120;
/** @param {number} dt */
const springSteps = (dt) => Math.max(1, Math.ceil(dt / DT));
/** @param {number} number @param {number} minimum @param {number} maximum */
const clamp = (number, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, number));
/** @param {number} amount */
const K2 = (amount) =>
  amount < 0.5
    ? 4 * amount * amount * amount
    : 1 - Math.pow(-2 * amount + 2, 3) / 2;
/** @param {number} amount */
const Rc = (amount) => 1 - Math.pow(1 - amount, 3);
/** @param {number} amount */
const y1e = (amount) =>
  1 + 2.70158 * Math.pow(amount - 1, 3) + 1.70158 * Math.pow(amount - 1, 2);
/** @param {number} amount */
const Dke = (amount) => amount * amount * (3 - 2 * amount);
/** @param {number} amount @param {number} elapsed */
const x_t = (amount, elapsed) =>
  1 - Math.exp(Math.log(1 - amount) * 60 * elapsed);
/** @param {number} amount @param {number} [elapsed] */
const Rn = (amount, elapsed = 1 / 60) => x_t(amount, elapsed);

/** @param {number} turn @param {number} tilt @param {number} roll @returns {import("../types.js").Matrix3} */
function rot3(turn, tilt, roll) {
  const degrees = Math.PI / 180;
  const turnCosine = Math.cos(turn * degrees);
  const turnSine = Math.sin(turn * degrees);
  const tiltCosine = Math.cos(tilt * degrees);
  const tiltSine = Math.sin(tilt * degrees);
  const rollCosine = Math.cos(roll * degrees);
  const rollSine = Math.sin(roll * degrees);
  return [
    rollCosine * turnCosine - rollSine * tiltSine * turnSine,
    -rollSine * tiltCosine,
    rollCosine * turnSine + rollSine * tiltSine * turnCosine,
    rollSine * turnCosine + rollCosine * tiltSine * turnSine,
    rollCosine * tiltCosine,
    rollSine * turnSine - rollCosine * tiltSine * turnCosine,
    -tiltCosine * turnSine,
    tiltSine,
    tiltCosine * turnCosine,
  ];
}

/** @param {import("../types.js").Pose} pose @param {import("../types.js").Pose} home @returns {import("../types.js").Matrix3} */
function relRot(pose, home) {
  const current = rot3(pose.turn, pose.tilt, pose.roll);
  const rest = rot3(home.turn, home.tilt, home.roll);
  return [
    current[0] * rest[0] + current[1] * rest[1] + current[2] * rest[2],
    current[0] * rest[3] + current[1] * rest[4] + current[2] * rest[5],
    current[0] * rest[6] + current[1] * rest[7] + current[2] * rest[8],
    current[3] * rest[0] + current[4] * rest[1] + current[5] * rest[2],
    current[3] * rest[3] + current[4] * rest[4] + current[5] * rest[5],
    current[3] * rest[6] + current[4] * rest[7] + current[5] * rest[8],
    current[6] * rest[0] + current[7] * rest[1] + current[8] * rest[2],
    current[6] * rest[3] + current[7] * rest[4] + current[8] * rest[5],
    current[6] * rest[6] + current[7] * rest[7] + current[8] * rest[8],
  ];
}

/**
 * @param {DOMRect | import("../types.js").Bounds} rect
 * @param {import("../types.js").PointerPoint} point
 * @param {number} [distanceScale]
 * @param {number} [horizontalRadius]
 * @param {number} [verticalRadius]
 * @param {number} [reach]
 * @returns {import("../types.js").PointerPoint}
 */
function mapPointer(
  rect,
  point,
  distanceScale = 0.6,
  horizontalRadius = 22,
  verticalRadius = 14,
  reach = 2,
) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  const distance = Math.min(
    1,
    Math.sqrt(Math.hypot(deltaX, deltaY) / (rect.width * reach)),
  );
  const angle = Math.atan2(deltaY, deltaX);
  return {
    x:
      centerX +
      distanceScale *
        (verticalRadius / horizontalRadius) *
        distance *
        Math.cos(angle) *
        rect.width,
    y: centerY + distanceScale * distance * Math.sin(angle) * rect.height,
  };
}

const core = Object.freeze({
  spring,
  stepSpring,
  springSteps,
  clamp,
  K2,
  Rc,
  y1e,
  Dke,
  Rn,
  relRot,
  mapPointer,
});

/** @param {() => number} random @returns {import("../types.js").MathPort} */
function create(random) {
  return Object.freeze({
    ...core,
    random,
    /** @param {number} minimum @param {number} maximum */
    rand: (minimum, maximum) => minimum + random() * (maximum - minimum),
    sign: () => (random() < 0.5 ? -1 : 1),
  });
}

export { create };
