// @ts-check
/* 一次性身体动作：跳跃、旋转、眩晕和庆祝。 */
/**
 * @typedef {{ kind: "spinDizzy" | "spinWild" | "spinBounce", t0: number, dir: number, turns: number }} Trick
 * @param {import("../types.js").MathPort} math
 */
function create(math) {
  const { spring, K2, rand, sign } = math;

  const HOP_SEGMENTS = [
    { h: 48, d: 0.5 },
    { h: 28, d: 0.382 },
    { h: 14, d: 0.27 },
  ];
  const HOP_DURATION = HOP_SEGMENTS.reduce(
    (sum, segment) => sum + segment.d,
    0,
  );
  const SPIN_BOUNCE_SPIN_DURATION = 0.7;
  const SPIN_BOUNCE_SETTLE_DURATION = 0.08;

  /** @param {number} startedAt @param {number} now @returns {number | null} */
  function sampleHop(startedAt, now) {
    if (startedAt < 0) return 0;
    const Et = (now - startedAt) / 1000;
    if (Et >= HOP_DURATION) return null;
    let En = 0;
    for (const seg of HOP_SEGMENTS) {
      if (Et < En + seg.d) {
        const bn = (Et - En) / seg.d;
        return -4 * seg.h * bn * (1 - bn);
      }
      En += seg.d;
    }
    return 0;
  }

  /** @param {Trick["kind"]} kind @param {boolean} reduce @param {number} now @param {number} [direction] @returns {Trick | null} */
  function startTrick(kind, reduce, now, direction = 0) {
    if (reduce) return null;
    const dir = direction === -1 || direction === 1 ? direction : sign();
    const turns =
      kind === "spinDizzy"
        ? Math.round(rand(3, 4))
        : kind === "spinWild"
          ? 9
          : 1;
    return { kind, t0: now, dir, turns };
  }

  /** @param {Trick | null} trick @param {number} now */
  function evalTrick(trick, now) {
    const empty = {
      turnRadians: null,
      rollOffsetDeg: 0,
      xOffsetPx: 0,
      yOffsetPx: 0,
      freeRollDeg: 0,
      gazeXPx: 0,
      gazeYPx: 0,
      lidOverride: null,
      eyeScale: null,
      done: !trick,
      requestHop: false,
    };
    if (!trick) return empty;
    const Et = (now - trick.t0) / 1000;
    const { kind, dir, turns } = trick;
    let turn = null,
      Kr = 0,
      yi = 0,
      ki = 0,
      Yr = 0,
      Zr = 0,
      wi = 0,
      lidMul = null,
      eyeBoost = null;
    let done = false,
      wantHop = false;

    if (kind === "spinDizzy") {
      const on = 0.55 + turns * 0.16,
        bn = 1.5;
      if (Et < on) {
        const Cn = Et / on;
        turn = turns * Math.PI * 2 * dir * (Cn * Cn);
      } else if (Et < on + bn) {
        const Cn = Et - on;
        const bi = Math.pow(1 - Cn / bn, 1.3);
        Kr = Math.sin(Cn * 10) * 17 * dir * bi;
        yi = Math.cos(Cn * 10) * 10 * dir * bi;
        ki = Math.sin(Cn * 20) * 3 * bi;
        lidMul = 0.46 + 0.14 * Math.sin(Cn * 21);
        eyeBoost = 1.03;
      } else done = true;
    } else if (kind === "spinWild") {
      const ud = 2.3 - 0.3;
      const Pc = 0.5;
      const Go = Math.PI * 2;
      const $i = 0.24 + 2.3 + 1.25;
      const gm = (turns * Go + Pc) / (0.3 / 2 + ud + 1.25 / 4);
      if (Et < $i + 1.7) {
        let cr;
        if (Et < 0.24) cr = (-Pc * (1 - Math.cos((Et / 0.24) * Math.PI))) / 2;
        else if (Et < 0.24 + 0.3) {
          const Ua = Et - 0.24;
          cr = -Pc + (gm * Ua * Ua) / (2 * 0.3);
        } else if (Et < 0.24 + 2.3)
          cr = -Pc + gm * (0.3 / 2 + (Et - 0.24 - 0.3));
        else if (Et < $i) {
          const Ua = (Et - 0.24 - 2.3) / 1.25;
          cr =
            -Pc +
            gm * (0.3 / 2 + ud) +
            (gm * 1.25 * (1 - Math.pow(1 - Ua, 4))) / 4;
        } else cr = turns * Go;
        turn = cr * dir;
        let pl = 0;
        if (Et > 0.24 + 2.3) {
          const Ua = Math.min((Et - 0.24 - 2.3) / 1.25, 1);
          pl = Ua < 0.4 ? 0 : Math.pow((Ua - 0.4) / 0.6, 2);
          if (Et >= $i) pl = Math.pow(1 - (Et - $i) / 1.7, 1.6);
        }
        const Yl = Math.max(Et - 0.24 - 2.3, 0);
        Yr = (cr / (turns * Go)) * 3 * 360 * dir;
        Kr = Math.sin(Yl * 9.2) * 11 * dir * pl;
        yi = (Math.cos(Yl * 9.2) - 1) * 6 * dir * pl;
        ki = Math.sin(Yl * 18.4) * 2.6 * pl;
        Zr = Math.sin(Yl * 11.5) * 13 * dir * pl;
        wi = (Math.cos(Yl * 9) - 1) * 3.5 * pl;
        lidMul = 1.14 - 0.44 * pl + 0.1 * Math.sin(Yl * 16) * pl;
        eyeBoost = 1.12 - 0.09 * pl;
      } else done = true;
    } else if (kind === "spinBounce") {
      const fullTurn = turns * Math.PI * 2 * dir;
      if (Et < SPIN_BOUNCE_SPIN_DURATION) {
        turn = fullTurn * K2(Et / SPIN_BOUNCE_SPIN_DURATION);
      } else {
        turn = fullTurn;
        const hopStart =
          SPIN_BOUNCE_SPIN_DURATION + SPIN_BOUNCE_SETTLE_DURATION;
        wantHop = Et >= hopStart;
        done = Et >= hopStart + HOP_DURATION;
      }
    }

    return {
      turnRadians: turn,
      rollOffsetDeg: Kr,
      xOffsetPx: yi,
      yOffsetPx: ki,
      freeRollDeg: Yr,
      gazeXPx: Zr,
      gazeYPx: wi,
      lidOverride: lidMul,
      eyeScale: eyeBoost,
      done,
      requestHop: wantHop,
    };
  }

  function makeSpinTurn(turns = 1, dir = sign()) {
    const s = spring(0);
    s.t = turns * Math.PI * 2 * dir;
    return s;
  }

  /** @param {import("../types.js").Spring} s */
  function spinTurnSettled(s) {
    return Math.abs(s.t - s.x) < 0.004 && Math.abs(s.v) < 0.015;
  }

  return Object.freeze({
    sampleHop,
    startTrick,
    sampleTrick: evalTrick,
    startSpin: makeSpinTurn,
    spinSettled: spinTurnSettled,
  });
}

export { create };
