/* 粒子和彩带控制器。只管理粒子生命周期，不计算身体或装饰图形。 */
(function (global) {
  const NS = "http://www.w3.org/2000/svg";
  const Re0 = 114.2705;
  const STAR_COLOR = "#f4c34e";
  const PALETTE = [
    "#f9705c",
    "#5b95f0",
    "#3fbe86",
    "#f5b13f",
    "#9a72ee",
    "#35c3bd",
  ];
  const STAR = (() => {
    const n = [];
    for (let e = 0; e < 10; e++) {
      const t = -Math.PI / 2 + (e * Math.PI) / 5;
      const s = e % 2 === 0 ? 1 : 0.42;
      n.push(`${(Math.cos(t) * s).toFixed(3)} ${(Math.sin(t) * s).toFixed(3)}`);
    }
    return "M" + n.join("L") + "Z";
  })();
  function createParticles(options) {
    const { back, clamp, data, front, idPrefix, getRadius } = options;
    const doc = options.document;
    const random = options.random;
    const randomRange = options.rand;
    const make = (tag, attrs) => {
      const node = doc.createElementNS(NS, tag);
      if (attrs) for (const key in attrs) node.setAttribute(key, attrs[key]);
      return node;
    };
    let reduce = options.reduceMotion === true;
    const scale = () => getRadius() / Re0;
    let spin = 0,
      sizeScale = 1,
      wide = false,
      sustain = false,
      last = -1;
    let parts = [];
    const burst = (W = 20, H = 1, G = 0) => {
      if (reduce || parts.length > 120) return;
      const R = data.Re;
      for (let Y = 0; Y < W; Y++) {
        const U = (Y / W) * Math.PI * 2 + randomRange(-0.35, 0.35);
        const ee = randomRange(96, 116) * scale();
        const te = randomRange(170, 360) * H;
        const ne = -Math.sin(U),
          j = Math.cos(U),
          Z = G * te * 0.2;
        const X = random() < 0.18;
        parts.push({
          x: R + Math.cos(U) * ee,
          y: R + Math.sin(U) * ee,
          vx: Math.cos(U) * te + ne * Z,
          vy: Math.sin(U) * te + j * Z - randomRange(20, 75),
          life: 0,
          max: randomRange(0.45, 0.85),
          r: X ? randomRange(4, 7) : randomRange(3.5, 8),
          rot: randomRange(0, 360),
          vr: randomRange(-260, 260),
          color: X ? STAR_COLOR : PALETTE[(random() * PALETTE.length) | 0],
          round: !X && random() < 0.3,
          star: X,
          orbit: null,
          el: null,
        });
      }
    };

    let planes = [],
      hue0 = 0,
      beltN = 4,
      spawnQ = [];
    let prevSpin = 0,
      spinVel = 0,
      seeding = false,
      cooling = false,
      lastSeedAt = -Infinity,
      trailId = 0;
    const THRESH = 0.9,
      HARD = 5,
      SUSTAIN_INTERVAL_MS = 3000;
    const makePlanes = (W = 1) => {
      const H = randomRange(-0.85, 0.85);
      planes = [];
      for (let G = 0; G < W; G++)
        planes.push({
          tilt: randomRange(0.16, 0.5),
          roll: H + (G * Math.PI) / W + randomRange(-0.12, 0.12),
        });
      beltN = W > 1 ? W * 3 : Math.round(randomRange(3, 5));
      hue0 = randomRange(0, 360);
    };
    const spawnBelt = (lam, dir, i) => {
      if (parts.length > 110) return;
      if (!planes.length) makePlanes();
      const Y = planes[i % planes.length];
      const R = data.Re;
      parts.push({
        x: R,
        y: R,
        vx: 0,
        vy: 0,
        ret: 0,
        life: 0,
        max: 9,
        r:
          beltN <= 3
            ? randomRange(8, 10.5)
            : beltN === 4
              ? randomRange(6.6, 8.6)
              : randomRange(5.6, 7.4),
        rot: randomRange(0, 360),
        vr: randomRange(-240, 240),
        color: PALETTE[(random() * PALETTE.length) | 0],
        hue: hue0 + (i * 360) / beltN + randomRange(-14, 14),
        hueSpan: randomRange(45, 95) * (random() < 0.5 ? 1 : -1),
        hueVel: randomRange(18, 42) * (random() < 0.5 ? 1 : -1),
        orbit: {
          lam,
          lamVel: dir * randomRange(0.5, 1.1),
          tilt: Y.tilt + randomRange(-0.04, 0.04),
          roll: Y.roll + randomRange(-0.05, 0.05),
          rad:
            scale() * 116 +
            ((i / planes.length) | 0) *
              (38 / (Math.ceil(beltN / planes.length) - 1)) +
            randomRange(-1.5, 1.5),
          radVel: randomRange(0, 2.5),
          follow: randomRange(0.74, 0.94),
          carry: 0,
          arc: randomRange(2.2, 3.4),
        },
        hist: [],
        el: null,
        trailEl: null,
        trailFrontEl: null,
        gradEl: null,
        stops: null,
      });
    };
    const project = (W, H) => {
      const G = W.rad * Math.sin(H),
        Y = -W.rad * Math.cos(H) * Math.sin(W.tilt);
      const U = Math.cos(W.roll),
        ee = Math.sin(W.roll);
      const R = data.Re;
      return { x: R + G * U - Y * ee, y: R + G * ee + Y * U };
    };
    const depth = (W, H) => Math.cos(H) * Math.cos(W.tilt);
    const q = (W) => Math.round(W * 10) / 10;
    const ribbon = (W, H) => {
      const G = W.length;
      let Y = 0;
      for (let le = 1; le < G; le++)
        Y += Math.hypot(W[le].x - W[le - 1].x, W[le].y - W[le - 1].y);
      const U = Math.min(H, Y * 0.34),
        ee = [],
        te = [];
      for (let le = 0; le < G; le++) {
        const Q = W[le > 0 ? le - 1 : 0],
          ae = W[le < G - 1 ? le + 1 : G - 1];
        let ce = ae.x - Q.x,
          xe = ae.y - Q.y;
        const Se = Math.hypot(ce, xe) || 1;
        ce /= Se;
        xe /= Se;
        const fe = (U * (0.5 + 0.5 * (le / (G - 1)))) / 2;
        ee.push(-xe * fe);
        te.push(ce * fe);
      }
      const arc = (le) =>
        `A${q(Math.max(Math.hypot(ee[le], te[le]), 0.2))} ${q(Math.max(Math.hypot(ee[le], te[le]), 0.2))} 0 0 0 `;
      const band = (le, Q) => {
        let ae = "";
        for (let ce = le; ce <= Q; ce++)
          ae += `${ce === le ? "M" : "L"}${q(W[ce].x + ee[ce])} ${q(W[ce].y + te[ce])}`;
        ae += Q === G - 1 ? arc(Q) : "L";
        for (let ce = Q; ce >= le; ce--)
          ae += `${ce === Q ? "" : "L"}${q(W[ce].x - ee[ce])} ${q(W[ce].y - te[ce])}`;
        if (le === 0)
          ae += `${arc(0)}${q(W[0].x + ee[0])} ${q(W[0].y + te[0])}`;
        return ae + "Z";
      };
      if (Y < 2) return { front: "", back: "" };
      let Z = "",
        X = "",
        se = 0;
      while (se < G) {
        const le = W[se].z >= 0;
        let Q = se;
        while (Q + 1 < G && W[Q + 1].z >= 0 === le) Q++;
        const ae = Math.max(se - 1, 0),
          ce = Math.min(Q + 1, G - 1);
        if (ce > ae) {
          const xe = band(ae, ce);
          le ? (Z += xe) : (X += xe);
        }
        se = Q + 1;
      }
      return { front: Z, back: X };
    };

    const tickVel = (dt, emitTrails) => {
      let H = spin - prevSpin;
      if (!isFinite(H) || Math.abs(H) > 1.2) H = 0;
      prevSpin = spin;
      const was = Math.abs(spinVel) >= THRESH;
      spinVel = emitTrails && dt > 0 ? H / dt : 0;
      const nowFast = Math.abs(spinVel) >= THRESH;
      if (!was && nowFast) {
        makePlanes(wide ? 3 : 1);
        seeding = false;
        cooling = false;
      }
      if (was && !nowFast) {
        spawnQ.length = 0;
        cooling = false;
      }
    };
    const seedBelts = (now, emitTrails) => {
      if (reduce || !emitTrails) return;
      const H = Math.abs(spinVel);
      const live = parts.some((U) => U.orbit != null && U.ret < 1);
      if (
        sustain &&
        seeding &&
        spawnQ.length === 0 &&
        H >= THRESH &&
        (!live || now - lastSeedAt >= SUSTAIN_INTERVAL_MS)
      ) {
        seeding = false;
        cooling = true;
      }
      if (!seeding && (H >= HARD || (sustain && cooling && H >= THRESH))) {
        seeding = true;
        cooling = false;
        lastSeedAt = now;
        spawnQ = [];
        for (let U = 0; U < beltN; U++)
          spawnQ.push({ at: now + U * randomRange(55, 105), i: U });
      }
      while (spawnQ.length && now >= spawnQ[0].at) {
        const U = spawnQ.shift();
        spawnBelt(spin - randomRange(0, 0.18), Math.sign(spinVel) || 1, U.i);
      }
    };
    const step = (dt, realDt) => {
      if (!parts.length) return;
      const spinning = Math.abs(spinVel) >= THRESH;
      const keep = [];
      const R = data.Re;
      for (const j of parts) {
        j.life += j.life > 0 ? realDt : dt;
        const Z = clamp(j.life / j.max, 0, 1);
        if (j.orbit) {
          const ce = !spinning || Z > 0.55;
          j.ret = clamp(j.ret + (ce ? realDt / 0.5 : -realDt / 0.35), 0, 1);
          if (j.ret >= 1) {
            j.trailEl?.remove();
            j.trailFrontEl?.remove();
            j.gradEl?.remove();
            continue;
          }
        } else if (j.life >= j.max) {
          j.el?.remove();
          continue;
        }
        const X = j.orbit
          ? Math.min(1, j.life / 0.26)
          : Z < 0.1
            ? Z / 0.1
            : Math.pow(1 - (Z - 0.1) / 0.9, 1.7);
        if (j.orbit) {
          const ce = j.orbit;
          if (spinning) {
            ce.carry = spinVel * ce.follow;
            ce.lam += spinVel * dt * ce.follow + ce.lamVel * dt;
            ce.rad += ce.radVel * dt;
          } else {
            ce.lam += (ce.carry + ce.lamVel) * dt;
            ce.carry *= Math.exp(-2.6 * dt);
            ce.lamVel *= Math.exp(-2.6 * dt);
            ce.rad += ce.radVel * dt;
          }
          const xe = project(ce, ce.lam);
          j.x = xe.x;
          j.y = xe.y;
          const Se = depth(ce, ce.lam);
          const fe = 0.72 + 0.28 * clamp(Se, 0, 1);
          const ke = Math.min(j.life / 0.34, 1);
          const be = ke * ke * (3 - 2 * ke);
          const Ne = Math.max(
            j.r * fe * 1.7 * sizeScale * be * (1 - 0.72 * j.ret * j.ret),
            0.5,
          );
          if (!j.trailEl) {
            const de = make("path", { "data-trail": "", stroke: "none" });
            const Te = make("linearGradient", {
              id: `${idPrefix}t${trailId++}`,
              gradientUnits: "userSpaceOnUse",
            });
            j.stops = [];
            for (let Ie = 0; Ie < 5; Ie++) {
              const qe = make("stop", { offset: (Ie / 4).toFixed(3) });
              Te.appendChild(qe);
              j.stops.push(qe);
            }
            back.appendChild(Te);
            j.gradEl = Te;
            de.setAttribute("fill", `url(#${Te.id})`);
            back.appendChild(de);
            j.trailEl = de;
            const Ce = make("path", {
              "data-trail": "",
              stroke: "none",
              fill: de.getAttribute("fill"),
            });
            front.appendChild(Ce);
            j.trailFrontEl = Ce;
          }
          const Ae = j.hist;
          const oe = Ae.length ? Ae[Ae.length - 1].l : ce.lam;
          const ve = ce.lam - oe;
          const ge = Math.min(Math.ceil(Math.abs(ve) / 0.09), 24);
          for (let de = 1; de <= ge; de++) {
            const Te = oe + (ve * de) / ge,
              Je = project(ce, Te);
            Ae.push({ x: Je.x, y: Je.y, l: Te, z: depth(ce, Te) });
          }
          if (!Ae.length) Ae.push({ x: j.x, y: j.y, l: ce.lam, z: Se });
          const ye = ce.arc * (1 - j.ret * j.ret * (3 - 2 * j.ret));
          while (Ae.length > 2 && Math.abs(ce.lam - Ae[0].l) > ye) Ae.shift();
          const ue = Math.abs(ce.lam - Ae[0].l) - ye;
          if (Ae.length >= 2 && ue > 0) {
            const de = Ae[0].l + Math.sign(ce.lam - Ae[0].l) * ue,
              Te = project(ce, de);
            Ae[0] = { x: Te.x, y: Te.y, l: de, z: depth(ce, de) };
          }
          if (Ae.length > 48) Ae.splice(0, Ae.length - 48);
          if (Ae.length >= 2) {
            const { front: de, back: Te } = ribbon(Ae, Ne);
            const Je = X.toFixed(3);
            j.trailEl.setAttribute("d", Te);
            j.trailEl.setAttribute("opacity", Je);
            j.trailFrontEl.setAttribute("d", de);
            j.trailFrontEl.setAttribute("opacity", Je);
            const qe = j.hue + j.hueVel * j.life;
            for (let we = 0; we < j.stops.length; we++) {
              const Pe = we / (j.stops.length - 1),
                je = qe + Pe * j.hueSpan;
              j.stops[we].setAttribute(
                "stop-color",
                `hsl(${(((je % 360) + 360) % 360).toFixed(0)} 56% ${(56 + 11 * Pe).toFixed(0)}%)`,
              );
            }
            const Ce = Ae[0],
              Ie = Ae[Ae.length - 1];
            j.gradEl.setAttribute("x1", Ce.x.toFixed(1));
            j.gradEl.setAttribute("y1", Ce.y.toFixed(1));
            j.gradEl.setAttribute("x2", Ie.x.toFixed(1));
            j.gradEl.setAttribute("y2", Ie.y.toFixed(1));
          } else {
            j.trailEl.setAttribute("opacity", "0");
            j.trailFrontEl.setAttribute("opacity", "0");
          }
          keep.push(j);
          continue;
        }
        j.x += j.vx * dt;
        j.y += j.vy * dt;
        const se = Math.pow(0.94, dt * 60);
        j.vx *= se;
        j.vy = j.vy * se + 40 * dt;
        const le = j.life / j.max;
        const Q = le < 0.1 ? le / 0.1 : Math.pow(1 - (le - 0.1) / 0.9, 1.7);
        const ae = Math.max(j.r * (1 - le * 0.4), 0.5);
        if (!j.el) {
          const ce = make(j.star ? "path" : j.round ? "circle" : "rect");
          if (j.star) ce.setAttribute("d", STAR);
          ce.setAttribute("fill", j.color);
          back.appendChild(ce);
          j.el = ce;
        }
        j.el.setAttribute("opacity", Q.toFixed(3));
        if (j.star) {
          j.rot += j.vr * dt;
          j.el.setAttribute(
            "transform",
            `translate(${j.x.toFixed(1)} ${j.y.toFixed(1)}) rotate(${j.rot.toFixed(1)}) scale(${ae.toFixed(2)})`,
          );
        } else if (j.round) {
          j.el.setAttribute("cx", j.x.toFixed(1));
          j.el.setAttribute("cy", j.y.toFixed(1));
          j.el.setAttribute("r", ae.toFixed(2));
        } else {
          const ce = Math.hypot(j.vx, j.vy);
          const xe = Math.max(ae * 2, Math.min(ce * 0.05, 30)),
            Se = ae * 1.5;
          const fe = (Math.atan2(j.vy, j.vx) * 180) / Math.PI;
          j.el.setAttribute("width", xe.toFixed(1));
          j.el.setAttribute("height", Se.toFixed(1));
          j.el.setAttribute("rx", (Se / 2).toFixed(2));
          j.el.setAttribute("x", (j.x - xe / 2).toFixed(1));
          j.el.setAttribute("y", (j.y - Se / 2).toFixed(1));
          j.el.setAttribute(
            "transform",
            `rotate(${fe.toFixed(1)} ${j.x.toFixed(1)} ${j.y.toFixed(1)})`,
          );
        }
        keep.push(j);
      }
      parts = keep;
    };

    const reset = (spinAngle = 0) => {
      for (const part of parts) {
        part.el?.remove();
        part.trailEl?.remove();
        part.trailFrontEl?.remove();
        part.gradEl?.remove();
      }
      parts = [];
      spawnQ = [];
      planes = [];
      seeding = false;
      cooling = false;
      lastSeedAt = -Infinity;
      spin = spinAngle;
      prevSpin = spinAngle;
      spinVel = 0;
      wide = false;
      sustain = false;
      last = -1;
    };

    return {
      burst,
      setReduceMotion(value) {
        reduce = !!value;
        if (reduce) reset(spin);
      },
      clear() {
        reset(spin);
      },
      reset,
      update(now, dt, G) {
        const Y = last < 0 ? dt : Math.max((now - last) / 1000, 0);
        last = now;
        sizeScale = G.sizeScale;
        spin = G.spinAngle;
        wide = G.wideStyle;
        sustain = G.sustainBelts === true;
        const emitTrails = G.emitTrails === true;
        tickVel(dt, emitTrails);
        seedBelts(now, emitTrails);
        step(dt, Y);
      },
    };
  }

  global.OPET_PARTICLES = Object.freeze({ create: createParticles });
})(globalThis[Symbol.for("o-pet.renderer")]);
