/* 视线控制器。只选择程序化视线目标和保持时间。 */
(function (g) {
  const { rand, sign } = g.GROK_MATH;

  function next(state, direction = 0) {
    const side = direction || sign();
    switch (state) {
      case "front":
      case "sleeping":
      case "dreaming":
        return { x: 0, y: 0, hold: [5000, 8000] };
      case "idle": {
        const look = Math.random();
        if (look < 0.55) return { x: 0, y: 0, hold: [3000, 6000] };
        return { x: side * rand(0.35, 0.75) * 15, y: rand(-0.25, 0.35) * 9, hold: [1800, 3600] };
      }
      case "listening":
        return { x: direction ? direction * 0.65 * 15 : rand(-0.3, 0.3) * 15, y: rand(-0.25, 0.25) * 9, hold: [2200, 4200] };
      case "thinking":
        return { x: sign() * rand(0.5, 1) * 15, y: -rand(0.4, 1) * 9, hold: [1500, 2800] };
      case "searching":
        return { x: side * rand(0.7, 1) * 15, y: rand(-1, 1) * 9, hold: [550, 1150] };
      case "working":
        return { x: rand(-0.4, 0.4) * 15, y: rand(0.4, 1) * 9, hold: [1200, 2400] };
      case "excited":
        return { x: rand(-1, 1) * 15, y: rand(-1, 0.3) * 9, hold: [700, 1400] };
      case "surprised":
        return { x: 0, y: 0, hold: [1600, 2600] };
      case "suspicious":
        return { x: sign() * 15, y: 0.3 * 9, hold: [2200, 4200] };
      case "angry":
        return { x: rand(-0.2, 0.2) * 15, y: 0.2 * 9, hold: [1800, 3200] };
      case "drowsy":
        return { x: rand(-0.4, 0.4) * 15, y: rand(0.4, 1) * 9, hold: [2500, 4500] };
      case "happy":
        return { x: rand(-0.7, 0.7) * 15, y: -rand(0, 0.6) * 9, hold: [1800, 3400] };
      case "curious":
        return { x: side * rand(0.6, 1) * 15, y: rand(-1, 1) * 9, hold: [950, 1900] };
      case "confused":
        return { x: sign() * rand(0.5, 1) * 15, y: rand(-0.6, 1) * 9, hold: [1100, 2300] };
      case "bored":
        return { x: sign() * rand(0.7, 1) * 15, y: rand(0.4, 0.9) * 9, hold: [3000, 6000] };
      case "proud":
        return { x: rand(-0.3, 0.3) * 15, y: -rand(0.3, 0.7) * 9, hold: [2600, 4600] };
      case "shy":
        return { x: sign() * rand(0.6, 1) * 15, y: rand(0.5, 1) * 9, hold: [2000, 4000] };
      case "sad":
        return { x: rand(-0.3, 0.3) * 15, y: rand(0.6, 1) * 9, hold: [2800, 5000] };
      case "laughing":
        return { x: rand(-0.5, 0.5) * 15, y: -rand(0.2, 0.6) * 9, hold: [800, 1700] };
      case "scared":
        return { x: sign() * rand(0.7, 1) * 15, y: rand(-0.6, 0.6) * 9, hold: [450, 1050] };
      case "playful":
        return { x: sign() * rand(0.5, 1) * 15, y: -rand(0, 0.6) * 9, hold: [900, 1800] };
      case "notifying": {
        const look = Math.random() < 0.72;
        return { x: (look ? 0.45 : 0.1) * 15, y: -(look ? 0.3 : 0.05) * 9, hold: [1200, 2400] };
      }
      default:
        return { x: rand(-0.4, 0.4) * 15, y: rand(-0.3, 0.3) * 9, hold: [2500, 5000] };
    }
  }

  g.GROK_GAZE = Object.freeze({ next });
})(window);
