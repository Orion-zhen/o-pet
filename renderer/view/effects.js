/* 身体形变和装饰渲染器。粒子与基础几何由独立模块提供。 */
(function (global) {
  function create(dependencies) {
    const NS = "http://www.w3.org/2000/svg";
    const CYCLE = new Set(["gather"]);
    const CYCLE_ON = { gather: 2000 };
    const CYCLE_OFF = 1500;
    const RADIUS = {
      dots: 22,
      orbit: 19,
      radar: 19,
      gather: 19,
      wave: 16,
      send: 20,
      receive: 20,
      dock: 20,
      ball: 18,
      whirl: 15,
      pencil: 17,
      bang: 13,
      standby: 13,
    };
    const FORM_MORPH_THRESHOLD = 0.62;
    const DOT_R = 22;
    const DOT_GAP = 62;
    const POP0 = 0.84;
    const POP1 = 0.22;
    const SEND_MS = 1500;
    const RECV_MS = 1700;
    const PENCIL_MS = 2500;

    const { clamp, Rc, y1e, K2 } = dependencies.math;
    const DATA = dependencies.data;
    const THINKING_ALT = dependencies.tables.THINKING_ALT;

    function pencilPose(now, stateAt) {
      const Pt = now - stateAt;
      const mt = (((Pt / PENCIL_MS) % 1) + 1) % 1;
      if (mt < 0.68) {
        const Mt = mt / 0.68;
        const Lt = Mt * Mt * (3 - 2 * Mt);
        const yn = clamp(Mt / 0.08, 0, 1) * clamp((1 - Mt) / 0.08, 0, 1);
        return {
          x: -54 + 118 * Lt,
          y: 26,
          wig: Math.sin(Mt * 24) * 3.2 * yn,
          rot: 17 + Math.sin(Pt * 6e-4) * 1,
          lift: false,
        };
      }
      const Dt = K2((mt - 0.68) / 0.32);
      return {
        x: 64 - 118 * Dt,
        y: 26 - 20 * Math.sin(Dt * Math.PI),
        wig: 0,
        rot: 17 - 2 * Math.sin(Dt * Math.PI) + Math.sin(Pt * 6e-4) * 1,
        lift: true,
      };
    }

    function smoothLine(pts) {
      const Pt = pts.length;
      let mt = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      if (Pt === 2)
        return mt + `L${pts[1][0].toFixed(1)} ${pts[1][1].toFixed(1)}`;
      for (let Dt = 0; Dt < Pt - 1; Dt++) {
        const Mt = pts[Math.max(Dt - 1, 0)],
          Lt = pts[Dt],
          yn = pts[Dt + 1],
          an = pts[Math.min(Dt + 2, Pt - 1)];
        mt += `C${(Lt[0] + (yn[0] - Mt[0]) / 6).toFixed(1)} ${(Lt[1] + (yn[1] - Mt[1]) / 6).toFixed(1)} ${(yn[0] - (an[0] - Lt[0]) / 6).toFixed(1)} ${(yn[1] - (an[1] - Lt[1]) / 6).toFixed(1)} ${yn[0].toFixed(1)} ${yn[1].toFixed(1)}`;
      }
      return mt;
    }

    function wave(ze) {
      return (
        0.42 +
        0.29 * Math.sin(ze * 0.0021) * Math.sin(ze * 0.0034) +
        0.29 * Math.sin(ze * 0.0013 + 1.7)
      );
    }

    function sampleThoughtDot(now, stateAt, R, index) {
      const phase = ((((now - stateAt) / THINKING_ALT.cycleMs) % 1) + 1) % 1;
      const localPhase =
        ((phase - THINKING_ALT.dotStarts[index] + 1) % 1) /
        THINKING_ALT.dotDuration;
      if (localPhase >= 1) return null;

      const approach = K2(clamp(localPhase / THINKING_ALT.absorbAt, 0, 1));
      const absorption = K2(
        clamp(
          (localPhase - THINKING_ALT.absorbAt) /
            (1 - THINKING_ALT.absorbAt),
          0,
          1,
        ),
      );
      const fusion = K2(
        clamp(
          (localPhase - THINKING_ALT.mergeAt) /
            (THINKING_ALT.absorbAt - THINKING_ALT.mergeAt),
          0,
          1,
        ),
      );
      const inverse = 1 - approach;
      const startX = R - 14 + index * 7;
      const controlX = R - 78 + index * 4;
      const contactAngle = 2.12 - index * 0.1;
      const contactRadius = [95, 93, 96][index];
      const contactX = R + Math.cos(contactAngle) * contactRadius;
      const contactY = R + Math.sin(contactAngle) * contactRadius;
      const absorptionDepth = 28 * absorption;
      const x =
        inverse * inverse * startX +
        2 * inverse * approach * controlX +
        approach * approach * contactX -
        Math.cos(contactAngle) * absorptionDepth;
      const y =
        inverse * inverse * (R + 168) +
        2 * inverse * approach * (R + 120) +
        approach * approach * contactY -
        Math.sin(contactAngle) * absorptionDepth;
      return {
        x,
        y,
        radius: 2.4 + 10.1 * approach,
        opacity: clamp(localPhase / 0.1, 0, 1),
        bump: {
          angle: contactAngle,
          amount: 8.5 * fusion * (1 - absorption),
          width: 0.24,
        },
      };
    }

    class OverlayLayer {
      constructor(options) {
        const doc = options.document;
        const random = options.random;
        const make = (tag, attrs) => {
          const node = doc.createElementNS(NS, tag);
          if (attrs)
            for (const key in attrs) node.setAttribute(key, attrs[key]);
          return node;
        };
        this.rand = options.rand;
        this.uid = `fx-${random().toString(36).slice(2, 8)}`;
        this.back = make("g", { "aria-hidden": "true" });
        this.front = make("g", { "aria-hidden": "true" });
        this.dots = [0, 1].map(() =>
          make("path", { style: "fill:var(--fg);display:none" }),
        );
        this.rings = [0, 1, 2, 3, 4, 5, 6].map(() =>
          make("circle", {
            cx: "0",
            cy: "0",
            r: "0",
            fill: "none",
            style: "display:none;stroke:var(--fg)",
          }),
        );
        this.parts = [0, 1, 2, 3, 4, 5, 6].map(() =>
          make("circle", {
            cx: "0",
            cy: "0",
            r: "0",
            style: "fill:var(--fg);display:none",
          }),
        );
        this.document = doc;
        this.bodyGroup = null;
        this.bodyNode = null;
        this.thoughtDots = [];
        this.glyphs = [0, 1, 2].map(() =>
          make("path", { style: "display:none" }),
        );
        this.ink = [];
        this.recvDir = -0.7;
        this.recvTick = -1;
        this.overlayAt = 0;
        this.primitiveColor = "var(--fg)";
        this.circlePath = "";
        this.pencilPath = "";
        this.bangPath = "";
      }

      attach(svg, bodyGroup) {
        this.bodyGroup = bodyGroup;
        this.bodyNode = bodyGroup.children[0];
        svg.appendChild(this.back);
        this.dots.forEach((n) => svg.appendChild(n));
        this.rings.forEach((n) => svg.appendChild(n));
        this.parts.forEach((n) => svg.appendChild(n));
        this.glyphs.forEach((n) => svg.appendChild(n));
        svg.appendChild(bodyGroup);
        svg.appendChild(this.front);
      }

      ensureThoughtDots() {
        while (this.thoughtDots.length < 3) {
          const dot = this.document.createElementNS(NS, "circle");
          dot.setAttribute("cx", "0");
          dot.setAttribute("cy", "0");
          dot.setAttribute("r", "0");
          dot.setAttribute("style", "fill:var(--fg);display:none");
          dot.style.fill = this.primitiveColor;
          this.bodyGroup.insertBefore(dot, this.bodyNode);
          this.thoughtDots.push(dot);
        }
      }

      hideAll() {
        for (const n of this.dots) n.style.display = "none";
        for (const n of this.rings) n.style.display = "none";
        for (const n of this.parts) n.style.display = "none";
        for (const n of this.thoughtDots) n.style.display = "none";
        for (const n of this.glyphs) n.style.display = "none";
      }

      amount(name, cur, prev, yl, mix) {
        if (name === cur) return yl * mix;
        if (name === prev) return yl * (1 - mix);
        return 0;
      }

      dotsPulse(now, slot, yl, reduce = false) {
        const Dt = ((((now - this.overlayAt) / 1400 + 0.119) % 1) + 1) % 1;
        let Mt = Math.abs(Dt - slot / 3);
        Mt = Math.min(Mt, 1 - Mt);
        const Lt = reduce ? 1 : Math.exp(-(Mt * Mt) / (2 * 0.15 * 0.15));
        const yn = reduce ? 0 : 1;
        return {
          lift: Lt * 9 * yl * yn,
          pop: 1 + yn * (POP0 + POP1 * Lt - 1),
          tone: 1 - yn * 0.5 * (1 - Lt),
        };
      }

      paint(now, stateAt, cur, prev, yl, mix, R, reduce = false) {
        this.hideAll();
        this._reduce = reduce;
        const extra = this.sampleForm(now, stateAt, cur, prev, yl, mix);
        const kl = (name) => this.amount(name, cur, prev, yl, mix);
        const run = (name, fn) => {
          const a = kl(name);
          if (a > 0.004) fn(a);
        };
        run("dots", (a) => this.paintDots(a, now, R));
        run("thought-pulse", (a) =>
          this.paintThoughtPulse(a, now, stateAt, R),
        );
        run("orbit", (a) => this.paintOrbit(a, now, R));
        run("radar", (a) => this.paintRadar(a, now, R, extra.radiusPx));
        run("gather", (a) => this.paintGather(a, now, R));
        run("wave", (a) => this.paintWave(a, now, R));
        run("send", (a) => this.paintSend(a, now, stateAt, R));
        run("receive", (a) => this.paintRecv(a, now, stateAt, R));
        run("dock", (a) => this.paintDock(a, now, stateAt, R));
        run("pencil", (a) => this.paintPencil(a, now, stateAt, R));
        run("bang", (a) => this.paintBang(a, now, stateAt, R));
        run("standby", (a) => this.paintStandby(a, now, R));
        for (const ring of this.rings) {
          if (ring.style.display === "") ring.style.stroke = this.primitiveColor;
        }
      }

      paintDots(ze, now, R) {
        const mt = [R - DOT_GAP, R + DOT_GAP];
        for (let Dt = 0; Dt < 2; Dt++) {
          const Mt = this.dots[Dt];
          const Lt = clamp((ze - Dt * 0.12) / (1 - Dt * 0.12), 0, 1);
          if (Lt <= 0.004) {
            Mt.style.display = "none";
            continue;
          }
          const yn = Rc(Lt),
            an = y1e(Lt),
            Et = this.dotsPulse(now, Dt === 0 ? 0 : 2, ze, this._reduce);
          const En = ((DOT_R * yn * Et.pop) / R) * 1.02;
          Mt.style.display = "";
          Mt.setAttribute("d", this.circlePath);
          Mt.setAttribute(
            "transform",
            `translate(${(R + (mt[Dt] - R) * an).toFixed(1)} ${(R - Et.lift).toFixed(1)}) scale(${En.toFixed(4)}) translate(${-R} ${-R})`,
          );
          Mt.setAttribute("opacity", (yn * Et.tone).toFixed(3));
        }
      }

      paintThoughtPulse(ze, now, stateAt, R) {
        this.ensureThoughtDots();
        const amount = Rc(ze);
        if (this._reduce) {
          for (let index = 0; index < 3; index++) {
            const dot = this.thoughtDots[index];
            dot.style.display = "";
            dot.setAttribute("cx", (R - 18 - index * 13).toFixed(1));
            dot.setAttribute("cy", (R + 122 - index * 15).toFixed(1));
            dot.setAttribute("r", ((3 + index * 2.5) * amount).toFixed(2));
            dot.setAttribute("opacity", (0.8 * amount).toFixed(3));
          }
          return;
        }

        for (let index = 0; index < THINKING_ALT.dotStarts.length; index++) {
          const dot = this.thoughtDots[index];
          const sample = sampleThoughtDot(now, stateAt, R, index);
          if (sample === null) {
            dot.style.display = "none";
            continue;
          }
          dot.style.display = "";
          dot.setAttribute("cx", sample.x.toFixed(1));
          dot.setAttribute("cy", sample.y.toFixed(1));
          dot.setAttribute("r", (sample.radius * amount).toFixed(2));
          dot.setAttribute("opacity", (sample.opacity * amount).toFixed(3));
        }
      }

      thoughtBumps(now, stateAt, cur, prev, yl, mix, R, reduce) {
        const amount = Rc(this.amount("thought-pulse", cur, prev, yl, mix));
        if (reduce || amount <= 0.004) return [];
        const bumps = [];
        for (let index = 0; index < THINKING_ALT.dotStarts.length; index++) {
          const sample = sampleThoughtDot(now, stateAt, R, index);
          if (sample !== null && sample.bump.amount > 0.004) {
            bumps.push({
              ...sample.bump,
              amount: sample.bump.amount * amount,
            });
          }
        }
        return bumps;
      }

      paintOrbit(ze, now, R) {
        const mt = Rc(ze),
          Mt = 52 * y1e(ze),
          Lt = 12,
          yn = now * 0.0017;
        for (let an = 0; an < 5; an++) {
          const Et = this.parts[an];
          const En = yn + (an * Math.PI * 2) / 5,
            Zt = Math.cos(En),
            dn = 0.5 + 0.5 * clamp(Zt, 0, 1);
          Et.style.display = "";
          Et.setAttribute("cx", (R + Mt * Math.sin(En)).toFixed(1));
          Et.setAttribute("cy", (R - Mt * 0.42 * Math.cos(En)).toFixed(1));
          Et.setAttribute("r", Math.max(Lt * dn * mt, 0.3).toFixed(2));
          Et.setAttribute(
            "opacity",
            (clamp((Zt + 0.4) / 0.6, 0.18, 1) * mt).toFixed(3),
          );
        }
      }

      paintRadar(ze, now, R, bodyR) {
        const Dt = Rc(ze);
        for (let yn = 0; yn < 3; yn++) {
          const an = this.rings[yn];
          const Et = (now / 1300 + yn / 3) % 1;
          an.style.display = "";
          an.removeAttribute("stroke-dasharray");
          an.removeAttribute("transform");
          an.setAttribute("cx", `${R}`);
          an.setAttribute("cy", `${R}`);
          an.setAttribute("r", (bodyR + (104 - bodyR) * Et).toFixed(1));
          an.setAttribute("stroke-width", (3.4 * (1 - Et * 0.55)).toFixed(2));
          an.setAttribute("opacity", (Dt * (1 - Et) * 0.9).toFixed(3));
        }
      }

      paintGather(ze, now, R) {
        const mt = Rc(ze),
          Dt = CYCLE_ON.gather;
        for (let Mt = 0; Mt < 5; Mt++) {
          const Lt = this.parts[Mt];
          const yn = clamp(
            ((now - this.overlayAt) / Dt - Mt * 0.09) / 0.62,
            0,
            1,
          );
          if (yn >= 1) {
            Lt.style.display = "none";
            continue;
          }
          const an = 1 - Math.pow(1 - yn, 3),
            Et = Mt * 2.4 + yn * 2.2,
            En = 96 * (1 - an);
          Lt.style.display = "";
          Lt.setAttribute("cx", (R + En * Math.cos(Et)).toFixed(1));
          Lt.setAttribute("cy", (R + En * Math.sin(Et) * 0.8).toFixed(1));
          Lt.setAttribute("r", (9 * (0.5 + 0.5 * an) * mt).toFixed(2));
          Lt.setAttribute(
            "opacity",
            (mt * clamp(yn * 5, 0, 1) * (1 - an * 0.25)).toFixed(3),
          );
        }
      }

      paintWave(ze, now, R) {
        const mt = [-2, -1, 1, 2],
          Dt = 44;
        for (let Mt = 0; Mt < 4; Mt++) {
          const Lt = Mt < 2 ? this.dots[Mt] : this.parts[3 + Mt];
          const yn = mt[Mt];
          const an = clamp(
            (ze - Math.abs(yn) * 0.1) / (1 - Math.abs(yn) * 0.1),
            0,
            1,
          );
          if (an <= 0.004) {
            Lt.style.display = "none";
            continue;
          }
          const Et = y1e(an),
            En =
              wave(now) *
              (0.55 + 0.45 * Math.sin(now * 0.012 - Math.abs(yn) * 1.05));
          const Zt = (7 + 9 * clamp(En, 0.08, 1)) * Rc(an),
            dn = 6 * clamp(En, 0, 1) * an;
          Lt.style.display = "";
          if (Mt < 2) {
            const on = (Zt / R) * 1.02;
            Lt.setAttribute("d", this.circlePath);
            Lt.setAttribute(
              "transform",
              `translate(${(R + yn * Dt * Et).toFixed(1)} ${(R - dn).toFixed(1)}) scale(${on.toFixed(4)}) translate(${-R} ${-R})`,
            );
            Lt.setAttribute("opacity", an.toFixed(3));
          } else {
            Lt.setAttribute("cx", (R + yn * Dt * Et).toFixed(1));
            Lt.setAttribute("cy", (R - dn).toFixed(1));
            Lt.setAttribute("r", Zt.toFixed(2));
            Lt.setAttribute("opacity", an.toFixed(3));
          }
        }
      }

      paintSend(ze, now, stateAt, R) {
        const mt = Rc(ze),
          Dt = ((((now - stateAt) / SEND_MS) % 1) + 1) % 1;
        const Mt = clamp((Dt - 0.18) / 0.55, 0, 1),
          Lt = Mt * Mt * (0.4 + 0.6 * Mt);
        const yn = 0.74,
          an = -0.62,
          Et = 108 * Lt,
          En = this.parts[5];
        const on = Mt > 0 && Mt < 1;
        En.style.display = on ? "" : "none";
        if (on) {
          En.setAttribute("cx", (R + yn * Et).toFixed(1));
          En.setAttribute("cy", (R + an * Et).toFixed(1));
          En.setAttribute("r", (10 * (1 - Lt * 0.55) * mt).toFixed(2));
          En.setAttribute("opacity", (mt * (1 - Lt * Lt)).toFixed(3));
        }
        const Zt = this.parts[6];
        const on2 = clamp((Dt - 0.26) / 0.55, 0, 1),
          bn = on2 * on2 * (0.4 + 0.6 * on2);
        const Cn = Mt > 0 && on2 > 0 && on2 < 1;
        Zt.style.display = Cn ? "" : "none";
        if (Cn) {
          const bi = 108 * bn;
          Zt.setAttribute("cx", (R + yn * bi).toFixed(1));
          Zt.setAttribute("cy", (R + an * bi).toFixed(1));
          Zt.setAttribute("r", (5 * (1 - bn * 0.6) * mt).toFixed(2));
          Zt.setAttribute("opacity", (mt * 0.3 * (1 - bn)).toFixed(3));
        }
        const dn = this.rings[5];
        const on3 = clamp((Dt - 0.18) / 0.3, 0, 1),
          bn3 = on3 > 0 && on3 < 1;
        dn.style.display = bn3 ? "" : "none";
        if (bn3) {
          dn.removeAttribute("stroke-dasharray");
          dn.removeAttribute("transform");
          dn.setAttribute("cx", `${R}`);
          dn.setAttribute("cy", `${R}`);
          dn.setAttribute("r", (20 + 34 * Rc(on3)).toFixed(1));
          dn.setAttribute("stroke-width", (2.8 * (1 - on3)).toFixed(2));
          dn.setAttribute("opacity", (mt * (1 - on3) * 0.8).toFixed(3));
        }
      }

      paintRecv(ze, now, stateAt, R) {
        const mt = Rc(ze),
          Dt = now - stateAt,
          Mt = Math.floor(Dt / RECV_MS);
        if (Mt !== this.recvTick) {
          this.recvTick = Mt;
          this.recvDir = this.rand(-Math.PI * 1.25, Math.PI * 0.25);
        }
        const Lt = (((Dt / RECV_MS) % 1) + 1) % 1,
          yn = clamp(Lt / 0.6, 0, 1),
          an = 1 - Math.pow(1 - yn, 3);
        const Et = Math.cos(this.recvDir),
          En = Math.sin(this.recvDir),
          Zt = 108 * (1 - an),
          dn = this.parts[5];
        const bn = yn < 1;
        dn.style.display = bn ? "" : "none";
        if (bn) {
          const Cn = 18 * Math.sin(yn * Math.PI) * (1 - an * 0.7);
          dn.setAttribute("cx", (R + Et * Zt + -En * Cn).toFixed(1));
          dn.setAttribute("cy", (R + En * Zt + Et * Cn).toFixed(1));
          dn.setAttribute("r", (3.5 + 6.5 * an).toFixed(2));
          dn.setAttribute(
            "opacity",
            (mt * clamp(yn * 3.5, 0, 1) * (0.3 + 0.7 * an)).toFixed(3),
          );
        }
        const on = this.rings[6];
        const bn2 = clamp((Lt - 0.58) / 0.32, 0, 1),
          Cn = bn2 > 0 && bn2 < 1;
        on.style.display = Cn ? "" : "none";
        if (Cn) {
          on.removeAttribute("stroke-dasharray");
          on.removeAttribute("transform");
          on.setAttribute("cx", `${R}`);
          on.setAttribute("cy", `${R}`);
          on.setAttribute("r", (20 + 26 * Rc(bn2)).toFixed(1));
          on.setAttribute("stroke-width", (2.8 * (1 - bn2)).toFixed(2));
          on.setAttribute("opacity", (mt * (1 - bn2) * 0.8).toFixed(3));
        }
      }

      paintDock(ze, now, stateAt, R) {
        const mt = Rc(ze),
          Dt = (now - stateAt) / 1000,
          Mt = 42,
          Lt = 1.1;
        for (let yn = 0; yn < 2; yn++) {
          const an = this.parts[5 + yn];
          const Et = clamp((Dt - (0.2 + yn * 1.3)) / 0.9, 0, 1);
          if (Et <= 0) {
            an.style.display = "none";
            continue;
          }
          const En = 1 - Math.pow(1 - Et, 3);
          const Zt = now * 0.001 * Lt + yn * Math.PI;
          const dn = R + Mt * Math.sin(Zt),
            on = R + Mt * 0.5 * Math.cos(Zt) + Math.sin(now * 0.003 + yn) * 2;
          const bn = R - 120 + yn * 30,
            Cn = R + 95;
          an.style.display = "";
          an.setAttribute("cx", (bn + (dn - bn) * En).toFixed(1));
          an.setAttribute("cy", (Cn + (on - Cn) * En).toFixed(1));
          an.setAttribute("r", ((7 + 3 * En) * mt).toFixed(2));
          an.setAttribute("opacity", (mt * clamp(Et * 4, 0, 1)).toFixed(3));
        }
      }

      paintPencil(ze, now, stateAt, R) {
        const mt = pencilPose(now, stateAt),
          Dt = this.glyphs[0];
        const Lt = ((mt.rot - 90) * Math.PI) / 180,
          yn = 68,
          an = Math.cos(Lt) * yn,
          Et = Math.sin(Lt) * yn;
        Dt.style.display = "";
        Dt.setAttribute("d", this.pencilPath);
        Dt.style.fill = "var(--fg)";
        Dt.setAttribute(
          "transform",
          `translate(${(R + (mt.x + an) * ze).toFixed(1)} ${(R + (mt.y + mt.wig * 0.15 + Et) * ze).toFixed(1)}) rotate(${(mt.rot * ze).toFixed(1)}) scale(${Rc(ze).toFixed(3)}) translate(${-R} ${-R})`,
        );
        Dt.setAttribute("opacity", clamp(ze * 1.6 - 0.3, 0, 1).toFixed(3));
        if (ze > 0.6 && !mt.lift) {
          const x = R + mt.x,
            y = R + mt.y + mt.wig + 19,
            last = this.ink[this.ink.length - 1];
          if (!last || Math.hypot(x - last[0], y - last[1]) > 2.4) {
            this.ink.push([x, y]);
            if (this.ink.length > 64) this.ink.shift();
          } else {
            last[0] = x;
            last[1] = y;
          }
        } else if (this.ink.length) this.ink.splice(0, 2);
        const line = this.glyphs[1];
        if (this.ink.length < 2) line.style.display = "none";
        else {
          line.style.display = "";
          line.style.fill = "none";
          line.style.stroke = "var(--fg)";
          line.setAttribute("stroke-width", "6");
          line.setAttribute("stroke-linecap", "round");
          line.setAttribute("stroke-linejoin", "round");
          line.setAttribute("d", smoothLine(this.ink));
          line.setAttribute("opacity", clamp(ze * 1.2, 0, 1).toFixed(3));
        }
      }

      paintBang(ze, now, stateAt, R) {
        const mt = this.glyphs[2];
        const Dt = (now - stateAt) / 1000,
          Mt = Rc(clamp(ze * 1.1, 0, 1));
        const Lt = Math.exp(-((Dt % 2.2) * 5.5)),
          yn = Math.sin(Dt * 42) * 2.2 * Lt;
        mt.style.display = "";
        mt.setAttribute("d", this.bangPath);
        mt.style.fill = "var(--fg)";
        mt.setAttribute(
          "transform",
          `translate(0 ${(-26 - (1 - Mt) * 70).toFixed(1)}) rotate(${yn.toFixed(2)} ${R} ${(R - 74).toFixed(1)}) translate(${R} ${R}) scale(${clamp(ze * 1.2, 0, 1).toFixed(3)}) translate(${-R} ${-R})`,
        );
        mt.setAttribute("opacity", clamp(ze * 1.5 - 0.2, 0, 1).toFixed(3));
      }

      paintStandby(ze, now, R) {
        const mt = Rc(ze),
          Dt = this.parts[4];
        const Lt = 0.5 + 0.5 * Math.sin(now * 0.0016);
        Dt.style.display = "";
        Dt.setAttribute("cx", `${R}`);
        Dt.setAttribute("cy", `${R}`);
        Dt.setAttribute("r", (26 + 7 * Lt).toFixed(1));
        Dt.setAttribute("opacity", (mt * (0.06 + 0.1 * Lt)).toFixed(3));
        const Mt = this.rings[2];
        const show = ze < 0.995;
        Mt.style.display = show ? "" : "none";
        if (show) {
          Mt.removeAttribute("stroke-dasharray");
          Mt.removeAttribute("transform");
          Mt.setAttribute("cx", `${R}`);
          Mt.setAttribute("cy", `${R}`);
          Mt.setAttribute("r", (104 - 88 * mt).toFixed(1));
          Mt.setAttribute("stroke-width", "2.4");
          Mt.setAttribute("opacity", ((1 - mt) * 0.5).toFixed(3));
        }
      }

      sampleForm(now, stateAt, cur, prev, yl, mix) {
        const kl = (name) => this.amount(name, cur, prev, yl, mix);
        const Lee = kl("dots");
        const rX = this.dotsPulse(now, 1, yl, this._reduce);
        let iX = 1;
        if (cur === "dots" || prev === "dots")
          iX = 1 + (rX.pop - 1) * (Lee / Math.max(yl, 0.001));
        const Fme = kl("receive");
        if (Fme > 0.004) {
          const _t = ((((now - stateAt) / RECV_MS) % 1) + 1) % 1,
            gn = clamp((_t - 0.58) / 0.34, 0, 1);
          iX *= 1 + 0.11 * Math.sin(gn * Math.PI) * Fme;
        }
        const zme = kl("send");
        if (zme > 0.004) {
          const _t = ((((now - stateAt) / SEND_MS) % 1) + 1) % 1;
          const gn = _t < 0.18 ? -0.06 * Math.sin((_t / 0.18) * Math.PI) : 0;
          const Gn =
            _t >= 0.18 && _t < 0.42
              ? 0.05 * Math.sin(((_t - 0.18) / 0.24) * Math.PI)
              : 0;
          iX *= 1 + (gn + Gn) * zme;
        }
        const qee = kl("bang");
        if (qee > 0.004)
          iX *=
            1 + 0.04 * Math.exp(-(((now - stateAt) / 1000) % 2.2) * 5.5) * qee;
        let yre = 0,
          aX = 0,
          wl = 0;
        const c1 = kl("pencil");
        if (c1 > 0.004) {
          const _t = pencilPose(now, stateAt);
          yre += _t.x * c1;
          aX += (_t.y + _t.wig * 0.5) * c1;
          wl += _t.rot * c1;
        }
        if (qee > 0.004) aX += 58 * qee;
        const jee = kl("whirl");
        if (jee > 0.004) {
          const _t = now / 1000;
          yre += (Math.sin(_t * 0.9) * 2 + Math.sin(_t * 1.7) * 0.8) * jee;
          aX += (Math.sin(_t * 1.3) * 2.4 + Math.sin(_t * 0.6) * 1.2) * jee;
        }
        const kre = kl("ball");
        if (kre > 0.004) {
          const _t = (now - stateAt) / 1000,
            gn = 0.62,
            Gn = 52,
            Ti = (8 * Gn) / (gn * gn),
            Ui = 40;
          const Si = Math.sqrt((2 * Ui) / Ti);
          let Ea;
          if (_t < Si) Ea = Ui - 0.5 * Ti * _t * _t;
          else {
            const Ca = ((((_t - Si) / gn) % 1) + 1) % 1;
            Ea = 4 * Gn * Ca * (1 - Ca);
          }
          aX += (40 - Ea) * kre;
        }
        const mixR = (tbl) => {
          if (!cur) return 19;
          return (
            tbl[cur] * mix +
            (prev ? tbl[prev] : tbl[cur]) * (1 - mix)
          );
        };
        const A2 = mixR(RADIUS);
        const wre = (A2 / DATA.Re) * iX;
        const standby = kl("standby");
        const fade =
          standby > 0 ? (0.28 + 0.2 * Math.sin(now * 0.0016)) * standby : 0;
        return {
          dotsAmount: Lee,
          dotPulse: rX,
          xPx: yre,
          yPx: aX,
          rollDeg: wl,
          radiusScale: wre,
          opacityFade: fade,
          radiusPx: A2,
        };
      }

      setPrimitiveColor(color) {
        this.primitiveColor = color;
        for (const primitive of [
          ...this.dots,
          ...this.parts,
          ...this.thoughtDots,
        ])
          primitive.style.fill = color;
      }

      resetInk() {
        this.ink = [];
      }
    }

    return Object.freeze({
      CYCLE,
      CYCLE_ON,
      CYCLE_OFF,
      FORM_MORPH_THRESHOLD,
      OverlayLayer,
    });
  }

  global.OPET_EFFECTS = Object.freeze({ create });
})(globalThis[Symbol.for("o-pet.renderer")]);
