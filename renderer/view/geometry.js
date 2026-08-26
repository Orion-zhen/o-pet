/* Grok 几何内核。集中处理路径采样、轮廓变形、截面和形状派生数据。 */
(function (g) {
  function create(dependencies) {
    const { clamp } = dependencies.math;
    const DATA = dependencies.data;
    const DEFAULT_RING_POINTS = 96;
    const DEFAULT_SPAN_ROWS = 160;

    const polyPath = (points) =>
      "M" +
      points
        .map((point) => `${point[0].toFixed(2)} ${point[1].toFixed(2)}`)
        .join("L") +
      "Z";

    const centroid = (points) => {
      let x = 0;
      let y = 0;
      for (const point of points) {
        x += point[0];
        y += point[1];
      }
      return [x / points.length, y / points.length];
    };

    const lerpPoly = (from, to, amount) =>
      from.map((point, index) => [
        point[0] + (to[index][0] - point[0]) * amount,
        point[1] + (to[index][1] - point[1]) * amount,
      ]);

    const lerpFace = (from, to, amount) => ({
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
      sx: from.sx + (to.sx - from.sx) * amount,
      sy: from.sy + (to.sy - from.sy) * amount,
      eye: from.eye + (to.eye - from.eye) * amount,
      leftDX:
        (from.leftDX ?? 0) + ((to.leftDX ?? 0) - (from.leftDX ?? 0)) * amount,
    });

    function flattenPath(path, step = 4) {
      const tokens =
        path.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
      const points = [];
      let index = 0;
      let command = "";
      let x = 0;
      let y = 0;
      let startX = 0;
      let startY = 0;
      const read = () => parseFloat(tokens[index++]);
      const sample = (curve, length) => {
        const count = Math.max(2, Math.ceil(length / step));
        for (let sampleIndex = 1; sampleIndex <= count; sampleIndex++) {
          points.push(curve(sampleIndex / count));
        }
      };

      while (index < tokens.length) {
        if (/[a-z]/i.test(tokens[index]))
          command = tokens[index++].toUpperCase();
        if (command === "Z") {
          if (Math.hypot(startX - x, startY - y) > 0.01) {
            sample(
              (amount) => [
                x + (startX - x) * amount,
                y + (startY - y) * amount,
              ],
              Math.hypot(startX - x, startY - y),
            );
          }
          x = startX;
          y = startY;
          continue;
        }
        if (index >= tokens.length) break;
        if (command === "M") {
          x = read();
          y = read();
          startX = x;
          startY = y;
          points.push([x, y]);
          command = "L";
        } else if (command === "L") {
          const nextX = read();
          const nextY = read();
          sample(
            (amount) => [x + (nextX - x) * amount, y + (nextY - y) * amount],
            Math.hypot(nextX - x, nextY - y),
          );
          x = nextX;
          y = nextY;
        } else if (command === "Q") {
          const controlX = read();
          const controlY = read();
          const nextX = read();
          const nextY = read();
          const fromX = x;
          const fromY = y;
          sample(
            (amount) => {
              const inverse = 1 - amount;
              return [
                inverse * inverse * fromX +
                  2 * inverse * amount * controlX +
                  amount * amount * nextX,
                inverse * inverse * fromY +
                  2 * inverse * amount * controlY +
                  amount * amount * nextY,
              ];
            },
            Math.hypot(controlX - x, controlY - y) +
              Math.hypot(nextX - controlX, nextY - controlY),
          );
          x = nextX;
          y = nextY;
        } else if (command === "C") {
          const control1X = read();
          const control1Y = read();
          const control2X = read();
          const control2Y = read();
          const nextX = read();
          const nextY = read();
          const fromX = x;
          const fromY = y;
          sample(
            (amount) => {
              const inverse = 1 - amount;
              return [
                inverse ** 3 * fromX +
                  3 * inverse * inverse * amount * control1X +
                  3 * inverse * amount * amount * control2X +
                  amount ** 3 * nextX,
                inverse ** 3 * fromY +
                  3 * inverse * inverse * amount * control1Y +
                  3 * inverse * amount * amount * control2Y +
                  amount ** 3 * nextY,
              ];
            },
            Math.hypot(control1X - x, control1Y - y) +
              Math.hypot(control2X - control1X, control2Y - control1Y) +
              Math.hypot(nextX - control2X, nextY - control2Y),
          );
          x = nextX;
          y = nextY;
        } else {
          index += 1;
        }
      }
      return points;
    }

    // 身体极坐标轮廓沿用原渲染器的采样器；它与眼睛截面使用的完整 SVG 采样器是不同的视觉契约。
    function flattenRingPath(path, step = 4) {
      const tokens =
        path.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
      const points = [];
      let index = 0;
      let command = "";
      let x = 0;
      let y = 0;
      let startX = 0;
      let startY = 0;
      const read = () => parseFloat(tokens[index++]);
      const sample = (curve, length) => {
        const count = Math.max(2, Math.ceil(length / step));
        for (let sampleIndex = 1; sampleIndex <= count; sampleIndex++)
          points.push(curve(sampleIndex / count));
      };
      while (index < tokens.length) {
        if (/[a-z]/i.test(tokens[index]))
          command = tokens[index++].toUpperCase();
        if (command === "Z") {
          if (Math.hypot(startX - x, startY - y) > 0.01) {
            sample(
              (amount) => [
                x + (startX - x) * amount,
                y + (startY - y) * amount,
              ],
              Math.hypot(startX - x, startY - y),
            );
          }
          x = startX;
          y = startY;
          continue;
        }
        if (index >= tokens.length) break;
        if (command === "M") {
          x = read();
          y = read();
          startX = x;
          startY = y;
          points.push([x, y]);
          command = "L";
        } else if (command === "L") {
          const nextX = read();
          const nextY = read();
          sample(
            (amount) => [x + (nextX - x) * amount, y + (nextY - y) * amount],
            Math.hypot(nextX - x, nextY - y),
          );
          x = nextX;
          y = nextY;
        } else if (command === "C") {
          const control1X = read();
          const control1Y = read();
          const control2X = read();
          const control2Y = read();
          const nextX = read();
          const nextY = read();
          const fromX = x;
          const fromY = y;
          sample(
            (amount) => {
              const inverse = 1 - amount;
              return [
                inverse ** 3 * fromX +
                  3 * inverse * inverse * amount * control1X +
                  3 * inverse * amount * amount * control2X +
                  amount ** 3 * nextX,
                inverse ** 3 * fromY +
                  3 * inverse * inverse * amount * control1Y +
                  3 * inverse * amount * amount * control2Y +
                  amount ** 3 * nextY,
              ];
            },
            Math.hypot(control1X - x, control1Y - y) +
              Math.hypot(control2X - control1X, control2Y - control1Y) +
              Math.hypot(nextX - control2X, nextY - control2Y),
          );
          x = nextX;
          y = nextY;
        } else {
          index += 1;
        }
      }
      return points;
    }

    function buildSpan(points, center, rows = DEFAULT_SPAN_ROWS) {
      let top = Infinity;
      let bottom = -Infinity;
      for (const point of points) {
        if (point[1] < top) top = point[1];
        if (point[1] > bottom) bottom = point[1];
      }
      const height = bottom - top;
      const rowY = (row) => top + (height * (row + 0.5)) / rows;
      const left = new Float64Array(rows);
      const right = new Float64Array(rows);
      for (let row = 0; row < rows; row++) {
        const y = rowY(row);
        let leftX = -Infinity;
        let rightX = Infinity;
        for (let index = 0; index < points.length; index++) {
          const from = points[index];
          const to = points[(index + 1) % points.length];
          if (from[1] <= y === to[1] <= y) continue;
          const x =
            from[0] + ((to[0] - from[0]) * (y - from[1])) / (to[1] - from[1]);
          if (x <= center) {
            if (x > leftX) leftX = x;
          } else if (x < rightX) {
            rightX = x;
          }
        }
        left[row] = Number.isFinite(leftX) ? leftX : center;
        right[row] = Number.isFinite(rightX) ? rightX : center;
      }
      return (y) => {
        const position = clamp(((y - top) / height) * rows - 0.5, 0, rows - 1);
        const first = Math.floor(position);
        const amount = position - first;
        const second = Math.min(first + 1, rows - 1);
        return [
          left[first] + (left[second] - left[first]) * amount,
          right[first] + (right[second] - right[first]) * amount,
        ];
      };
    }

    const pathSpanCache = new Map();
    function spanAt(path, center) {
      let span = pathSpanCache.get(path);
      if (!span) {
        span = buildSpan(flattenPath(path), center);
        pathSpanCache.set(path, span);
      }
      return span;
    }

    function spanPoly(points, y, center) {
      let left = -Infinity;
      let right = Infinity;
      for (let index = 0; index < points.length; index++) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        if (from[1] <= y === to[1] <= y) continue;
        const x =
          from[0] + ((to[0] - from[0]) * (y - from[1])) / (to[1] - from[1]);
        if (x <= center) {
          if (x > left) left = x;
        } else if (x < right) {
          right = x;
        }
      }
      return [
        Number.isFinite(left) ? left : center,
        Number.isFinite(right) ? right : center,
      ];
    }

    function closedSpline(points) {
      const count = points.length;
      let path = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
      for (let index = 0; index < count; index++) {
        const before = points[(index - 1 + count) % count];
        const point = points[index];
        const next = points[(index + 1) % count];
        const after = points[(index + 2) % count];
        path += `C${(point[0] + (next[0] - before[0]) / 6).toFixed(2)} ${(point[1] + (next[1] - before[1]) / 6).toFixed(2)} ${(next[0] - (after[0] - point[0]) / 6).toFixed(2)} ${(next[1] - (after[1] - point[1]) / 6).toFixed(2)} ${next[0].toFixed(2)} ${next[1].toFixed(2)}`;
      }
      return path + "Z";
    }

    function circleRing(radius, count = DEFAULT_RING_POINTS) {
      return Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        return [
          radius + Math.cos(angle) * radius,
          radius + Math.sin(angle) * radius,
        ];
      });
    }

    function polarRing(points, center, count = DEFAULT_RING_POINTS) {
      return Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        const rayX = Math.cos(angle);
        const rayY = Math.sin(angle);
        let radius = 0;
        for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
          const from = points[pointIndex];
          const to = points[(pointIndex + 1) % points.length];
          const fromX = from[0] - center;
          const fromY = from[1] - center;
          const toX = to[0] - center;
          const toY = to[1] - center;
          const denominator = (toX - fromX) * rayY - (toY - fromY) * rayX;
          if (Math.abs(denominator) < 1e-9) continue;
          const amount = (fromX * rayY - fromY * rayX) / -denominator;
          if (amount < 0 || amount > 1) continue;
          const intersection =
            (fromX + (toX - fromX) * amount) * rayX +
            (fromY + (toY - fromY) * amount) * rayY;
          if (intersection > radius) radius = intersection;
        }
        return [center + rayX * radius, center + rayY * radius];
      });
    }

    function rotateRing(points, offset, center) {
      const count = points.length;
      const angle = (offset / count) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      return Array.from({ length: count }, (_, index) => {
        const point = points[(((index - offset) % count) + count) % count];
        const x = point[0] - center;
        const y = point[1] - center;
        return [center + x * cosine - y * sine, center + x * sine + y * cosine];
      });
    }

    function lerpRing(from, to, amount) {
      return from.map((point, index) => [
        point[0] + (to[index][0] - point[0]) * amount,
        point[1] + (to[index][1] - point[1]) * amount,
      ]);
    }

    function spanHalf(ring, y, center) {
      let left = -Infinity;
      let right = Infinity;
      for (let index = 0; index < ring.length; index++) {
        const from = ring[index];
        const to = ring[(index + 1) % ring.length];
        if (from[1] <= y === to[1] <= y) continue;
        const x =
          from[0] + ((to[0] - from[0]) * (y - from[1])) / (to[1] - from[1]);
        if (x <= center) {
          if (x > left) left = x;
        } else if (x < right) {
          right = x;
        }
      }
      return [
        Number.isFinite(left) ? left : center,
        Number.isFinite(right) ? right : center,
      ];
    }

    function capsule(width, height, center) {
      const radius = width / 2;
      const top = center - height / 2 + radius;
      const bottom = center + height / 2 - radius;
      return `M${center - radius} ${top}A${radius} ${radius} 0 0 1 ${center + radius} ${top}L${center + radius} ${bottom}A${radius} ${radius} 0 0 1 ${center - radius} ${bottom}Z`;
    }

    function taper(topWidth, bottomWidth, height, center) {
      const topRadius = topWidth / 2;
      const bottomRadius = bottomWidth / 2;
      const top = center - height / 2;
      const bottom = center + height / 2;
      return `M${center - topRadius} ${top + topRadius}A${topRadius} ${topRadius} 0 0 1 ${center + topRadius} ${top + topRadius}L${center + bottomRadius} ${bottom - bottomRadius}A${bottomRadius} ${bottomRadius} 0 0 1 ${center - bottomRadius} ${bottom - bottomRadius}Z`;
    }

    function solidRadii(solid, angle, count = DEFAULT_RING_POINTS) {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const rotated = solid.map(([x, y, z, radius]) => [
        x * cosine + z * sine,
        y,
        radius,
      ]);
      const raw = Array.from({ length: count }, (_, index) => {
        const direction = (index / count) * Math.PI * 2;
        const xDirection = Math.cos(direction);
        const yDirection = Math.sin(direction);
        let radius = 0;
        for (const [x, y, sphereRadius] of rotated) {
          const projection = xDirection * x + yDirection * y;
          const discriminant =
            projection * projection -
            (x * x + y * y) +
            sphereRadius * sphereRadius;
          if (discriminant <= 0) continue;
          const candidate = projection + Math.sqrt(discriminant);
          if (candidate > radius) radius = candidate;
        }
        return radius;
      });
      const size = raw.length;
      return raw.map(
        (radius, index) =>
          (raw[(index - 2 + size) % size] +
            4 * raw[(index - 1 + size) % size] +
            6 * radius +
            4 * raw[(index + 1) % size] +
            raw[(index + 2) % size]) /
          16,
      );
    }

    function makeTurnAt(solid, ring, center) {
      const rest = solidRadii(solid, 0);
      return (yaw) => {
        let scale = solidRadii(solid, yaw).map((radius, index) =>
          clamp((radius + 12) / (rest[index] + 12), 0.32, 1.5),
        );
        const count = scale.length;
        for (let pass = 0; pass < 3; pass++) {
          const previous = scale;
          scale = previous.map(
            (value, index) =>
              (previous[(index - 2 + count) % count] +
                4 * previous[(index - 1 + count) % count] +
                6 * value +
                4 * previous[(index + 1) % count] +
                previous[(index + 2) % count]) /
              16,
          );
        }
        return ring.map(([x, y], index) => [
          center + (x - center) * scale[index],
          center + (y - center) * scale[index],
        ]);
      };
    }

    const shapeModelCache = new Map();
    function shapeModel(name) {
      let model = shapeModelCache.get(name);
      if (model) return model;
      const data = DATA.shapes[name];
      if (!data) return null;
      const center = DATA.Re;
      const flattened = flattenPath(data.path);
      const ring = polarRing(flattenRingPath(data.path), center);
      let beltRadius = data.beltRadius;
      if (beltRadius == null) {
        let top = Infinity;
        let bottom = -Infinity;
        for (const point of ring) {
          if (point[1] < top) top = point[1];
          if (point[1] > bottom) bottom = point[1];
        }
        beltRadius = 0;
        for (let y = top; y <= bottom; y += 2) {
          const [left, right] = spanHalf(ring, y, center);
          beltRadius = Math.max(beltRadius, (right - left) / 2);
        }
      }
      const solid = DATA.solids?.[name];
      model = Object.freeze({
        name,
        data,
        flattened,
        ring,
        pathSpan: spanAt(data.path, center),
        beltRadius,
        turnAt: solid ? makeTurnAt(solid, ring, center) : null,
      });
      shapeModelCache.set(name, model);
      return model;
    }

    function shapeMetrics(name) {
      const model = shapeModel(name);
      if (!model) return null;
      return {
        face: model.data.face,
        ring: model.ring,
        tilt: model.data.tiltScale || 1,
        belt: model.beltRadius,
      };
    }

    const circleCache = new Map();
    function circlePathOf(radius) {
      let path = circleCache.get(radius);
      if (!path) {
        path = closedSpline(circleRing(radius));
        circleCache.set(radius, path);
      }
      return path;
    }

    function formRing(kind, center, teardropPath) {
      if (kind === "pencil" && teardropPath) {
        return rotateRing(
          polarRing(flattenRingPath(teardropPath), center),
          DEFAULT_RING_POINTS / 2,
          center,
        );
      }
      return circleRing(center);
    }

    return Object.freeze({
      DEFAULT_RING_POINTS,
      DEFAULT_SPAN_ROWS,
      polyPath,
      centroid,
      lerpPoly,
      lerpFace,
      flattenPath,
      flattenRingPath,
      buildSpan,
      spanAt,
      spanPoly,
      closedSpline,
      circleRing,
      polarRing,
      rotateRing,
      lerpRing,
      spanHalf,
      capsule,
      taper,
      solidRadii,
      makeTurnAt,
      shapeModel,
      shapeMetrics,
      circlePathOf,
      formRing,
    });
  }

  g.GROK_GEOMETRY = Object.freeze({ create });
})(window);
