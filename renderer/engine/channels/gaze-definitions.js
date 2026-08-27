// @ts-check
/* 可复用视线控制器定义。 */

/**
 * @typedef {{ x: number, y: number, hold: [number, number] }} GazeSample
 * @typedef {(direction: number, side: number) => GazeSample} GazeHandler
 * @param {import("../../types.js").MathPort} math
 * @returns {Readonly<Record<string, GazeHandler>>}
 */
function create(math) {
  const { rand, sign, random } = math;
  /** @type {GazeHandler} */
  const front = () => ({ x: 0, y: 0, hold: [5000, 8000] });
  /** @type {Record<string, GazeHandler>} */
  const definitions = {
    front,
    sleeping: front,
    dreaming: front,
    idle(_direction, side) {
      const look = random();
      if (look < 0.55) return { x: 0, y: 0, hold: [3000, 6000] };
      return {
        x: side * rand(0.35, 0.75) * 15,
        y: rand(-0.25, 0.35) * 9,
        hold: [1800, 3600],
      };
    },
    listening(direction) {
      return {
        x: direction ? direction * 0.65 * 15 : rand(-0.3, 0.3) * 15,
        y: rand(-0.25, 0.25) * 9,
        hold: [2200, 4200],
      };
    },
    thinking() {
      return {
        x: sign() * rand(0.5, 1) * 15,
        y: -rand(0.4, 1) * 9,
        hold: [1500, 2800],
      };
    },
    searching(_direction, side) {
      return {
        x: side * rand(0.7, 1) * 15,
        y: rand(-1, 1) * 9,
        hold: [550, 1150],
      };
    },
    working() {
      return {
        x: rand(-0.4, 0.4) * 15,
        y: rand(0.4, 1) * 9,
        hold: [1200, 2400],
      };
    },
    excited() {
      return {
        x: rand(-1, 1) * 15,
        y: rand(-1, 0.3) * 9,
        hold: [700, 1400],
      };
    },
    surprised() {
      return { x: 0, y: 0, hold: [1600, 2600] };
    },
    suspicious() {
      return { x: sign() * 15, y: 0.3 * 9, hold: [2200, 4200] };
    },
    angry() {
      return { x: rand(-0.2, 0.2) * 15, y: 0.2 * 9, hold: [1800, 3200] };
    },
    drowsy() {
      return {
        x: rand(-0.4, 0.4) * 15,
        y: rand(0.4, 1) * 9,
        hold: [2500, 4500],
      };
    },
    happy() {
      return {
        x: rand(-0.7, 0.7) * 15,
        y: -rand(0, 0.6) * 9,
        hold: [1800, 3400],
      };
    },
    curious(_direction, side) {
      return {
        x: side * rand(0.6, 1) * 15,
        y: rand(-1, 1) * 9,
        hold: [950, 1900],
      };
    },
    confused() {
      return {
        x: sign() * rand(0.5, 1) * 15,
        y: rand(-0.6, 1) * 9,
        hold: [1100, 2300],
      };
    },
    bored() {
      return {
        x: sign() * rand(0.7, 1) * 15,
        y: rand(0.4, 0.9) * 9,
        hold: [3000, 6000],
      };
    },
    proud() {
      return {
        x: rand(-0.3, 0.3) * 15,
        y: -rand(0.3, 0.7) * 9,
        hold: [2600, 4600],
      };
    },
    shy() {
      return {
        x: sign() * rand(0.6, 1) * 15,
        y: rand(0.5, 1) * 9,
        hold: [2000, 4000],
      };
    },
    sad() {
      return {
        x: rand(-0.3, 0.3) * 15,
        y: rand(0.6, 1) * 9,
        hold: [2800, 5000],
      };
    },
    laughing() {
      return {
        x: rand(-0.5, 0.5) * 15,
        y: -rand(0.2, 0.6) * 9,
        hold: [800, 1700],
      };
    },
    scared() {
      return {
        x: sign() * rand(0.7, 1) * 15,
        y: rand(-0.6, 0.6) * 9,
        hold: [450, 1050],
      };
    },
    playful() {
      return {
        x: sign() * rand(0.5, 1) * 15,
        y: -rand(0, 0.6) * 9,
        hold: [900, 1800],
      };
    },
    notifying() {
      const look = random() < 0.72;
      return {
        x: (look ? 0.45 : 0.1) * 15,
        y: -(look ? 0.3 : 0.05) * 9,
        hold: [1200, 2400],
      };
    },
    ambient() {
      return {
        x: rand(-0.4, 0.4) * 15,
        y: rand(-0.3, 0.3) * 9,
        hold: [2500, 5000],
      };
    },
  };
  return Object.freeze(definitions);
}

export { create };
