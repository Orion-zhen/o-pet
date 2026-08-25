/* Grok 数值内核：标量、缓动、弹簧和姿态矩阵。 */
(function (g) {
  const spring = (x) => ({ x, v: 0, t: x });
  const stepSpring = (state, frequency, damping, dt) => {
    state.v += (-2 * damping * frequency * state.v - frequency * frequency * (state.x - state.t)) * dt;
    state.x += state.v * dt;
    if (!Number.isFinite(state.x) || !Number.isFinite(state.v)) {
      state.x = state.t;
      state.v = 0;
    }
  };
  const DT = 1 / 120;
  const springSteps = (dt) => Math.max(1, Math.ceil(dt / DT));
  const clamp = (number, minimum, maximum) => Math.min(maximum, Math.max(minimum, number));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const rand = (minimum, maximum) => minimum + Math.random() * (maximum - minimum);
  const sign = () => (Math.random() < 0.5 ? -1 : 1);
  const K2 = (amount) => (
    amount < 0.5
      ? 4 * amount * amount * amount
      : 1 - Math.pow(-2 * amount + 2, 3) / 2
  );
  const Rc = (amount) => 1 - Math.pow(1 - amount, 3);
  const y1e = (amount) => (
    1 + 2.70158 * Math.pow(amount - 1, 3) + 1.70158 * Math.pow(amount - 1, 2)
  );
  const Dke = (amount) => amount * amount * (3 - 2 * amount);
  const x_t = (amount, elapsed) => 1 - Math.exp(Math.log(1 - amount) * 60 * elapsed);
  const Rn = (amount, elapsed = 1 / 60) => x_t(amount, elapsed);

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

  function mapPointer(rect, point, distanceScale = 0.6, horizontalRadius = 22, verticalRadius = 14, reach = 2) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = point.x - centerX;
    const deltaY = point.y - centerY;
    const distance = Math.min(1, Math.sqrt(Math.hypot(deltaX, deltaY) / (rect.width * reach)));
    const angle = Math.atan2(deltaY, deltaX);
    return {
      x: centerX + distanceScale * (verticalRadius / horizontalRadius) * distance * Math.cos(angle) * rect.width,
      y: centerY + distanceScale * distance * Math.sin(angle) * rect.height,
    };
  }

  g.GROK_MATH = Object.freeze({
    spring,
    stepSpring,
    DT,
    springSteps,
    clamp,
    lerp,
    rand,
    sign,
    K2,
    Rc,
    y1e,
    Dke,
    x_t,
    Rn,
    rot3,
    relRot,
    mapPointer,
  });
})(window);
