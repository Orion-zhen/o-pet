/* L2 — GrokCharacter. Orchestrates pose, eyes, tricks, overlays. Source $_t + sd(). */
(function (g) {
  const M = g.GROK_MATH;
  const T = g.GROK_TABLES;
  const { applyPose, nextGaze } = g.GROK_POSE;
  const TR = g.GROK_TRICKS;
  const EY = g.GROK_EYES;
  const FX = g.GROK_FX;
  const {
    spring, stepSpring, springSteps, clamp, rand, sign, K2, Dke, lerpPoly, lerpFace, relRot, mapPointer, Rn,
  } = M;
  const {
    GROUPS, EYE_PLAYLIST, EYE_HOLD_MS, BLINK_MS,
    ONBOARDING, ONBOARDING_MS, onboardMood,
    SPRINGS, FACE_TUNE, POSE, POSE_HOME, UNIFORM_EYES,
    V_T, B_T, WINK_STATES, poseScale, shapeEyeScale, overlayViewZoom,
    VIEW, VIEW_HALF, VIEW_MID, inkFg, inkCss, EYE_BG,
  } = T;

  class GrokCharacter {
    constructor(svg, opts = {}) {
      this.svg = svg;
      this.shapeName = opts.shape || "blob";
      this.colorId = opts.color || "black";
      this.scheme = opts.scheme || "light";
      this.mode = opts.mode || "onboarding";
      this.state = opts.state || "idle";
      this.poseState = null;
      this.expressionState = null;
      this.effectState = null;
      this.gazeState = null;
      this.onChange = opts.onChange || (() => {});
      this.loginWrap = opts.loginWrap !== false;
      this.eyeTopology = opts.eyeTopology ?? this.loginWrap;
      this.faceTune = opts.faceTune ?? (this.loginWrap ? FACE_TUNE : null);
      this.pose = { ...(this.loginWrap ? POSE : { turn: 0, tilt: 0, roll: 0, scale: 1 }), ...opts.pose };
      this.poseHome = opts.poseHome || (this.loginWrap ? POSE_HOME : { turn: 0, tilt: 0, roll: 0 });
      this.uniformEyes = opts.uniformEyes ?? (this.loginWrap ? UNIFORM_EYES : false);
      this.eyeScaleProp = opts.eyeScale ?? (this.loginWrap ? shapeEyeScale(this.shapeName) : 1);
      this.emphasis = !!opts.emphasis;
      this.followPointer = !!opts.followPointer;
      this.gazeTarget = opts.gazeTarget || null;
      this.paused = !!opts.paused;
      this.reduceMotion = opts.reduceMotion ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.badgeColor = opts.badgeColor || "var(--gb-badge, #1d9bf0)";
      this.sizePx = opts.sizePx || null;
      this.eyeColor = opts.eyeColor || null;
      this.inkFlat = opts.inkFlat || null;

      this.spin = spring(0);
      this.tx = spring(0);
      this.ty = spring(0);
      this.squash = spring(1);
      this.blink = spring(1);
      this.eyeScale = spring(1);
      this.gazeX = spring(0);
      this.gazeY = spring(0);
      this.eyeMorph = spring(1);
      this.overlay = spring(0);
      this.overlayMix = spring(1);
      this.notify = spring(0);
      this.humDots = spring(0);
      this.shapeSpring = spring(1);
      this.overlayTurn = spring(0);
      this.emphasisBlend = 0;

      this.eyeFrom = 0;
      this.eyeTo = 0;
      this.eyeStiffness = 7;
      this.eyeIdx = 0;
      this._fromPolys = null;

      this.t0 = performance.now();
      this.stateAt = this.t0;
      this.poseAt = this.t0;
      this.effectAt = this.t0;
      this.last = this.t0;
      this.moodN = 0;
      this.eyeUntil = this.t0 + rand(...EYE_HOLD_MS.idle);
      this.blinkUntil = this.t0 + rand(1500, 7000);
      this.gazeUntil = this.t0 + 800;
      this.blinkQueue = [];
      this.winkAt = -1e9;
      this.winkEye = 0;
      this.winkUntil = this.t0 + rand(3000, 8000);
      this.spinTurn = null;
      this.trick = null;
      this.hopAt = -1;
      this.trickAt = this.t0 + rand(2500, 5000);
      this.trickCycle = Math.floor(rand(0, 5));
      this.wildWide = false;
      this.ovSpin = 0;
      this.ovTurnAcc = 0;
      this.ovOn = false;
      this.ovTurnDir = 1;
      this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      this.pointerRaw = null;
      this.rectCache = null;
      this.rectAt = -1e9;
      this.prevShape = this.shapeName;
      this.prevFace = null;
      this.prevRing = null;
      this.prevTilt = null;
      this.prevBelt = null;
      this.ctx = this._freshCtx(this.t0);
      this.ovKind = null;
      this.ovPrev = null;
      this.ovTarget = null;
      this.ovRest = false;
      this.ovRestAt = 0;
      this.pxW = 190;
      this.pxAt = 0;
      this.partScale = 1;
      this.celebrateAt = -1;
      this.extras = { turn: null, Kr: 0, yi: 0, ki: 0, Yr: 0, Zr: 0, wi: 0, hop: 0 };

      this._build();
      this.setColor(this.colorId, this.scheme);
      this._applyPoseScale();
      this.setState(this.state, { resetEyes: true });
      this._bindPointer();
      this._paint(this.t0);
      this._raf = this.paused ? null : requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
      if (this._raf !== null) cancelAnimationFrame(this._raf);
      this._unbindPointer();
      this.particles?.clear();
    }

    _freshCtx(now) {
      return {
        nodUntil: now + 1800,
        nodEnd: 0,
        angryShakeUntil: 0,
        impulseAt: now + rand(500, 1200),
        tyKick: 0,
        spinKick: 0,
        forceSleepEye: false,
        wakeEye: null,
        wakeBlink: false,
        wakingBlinked: false,
        slumpAt: 0,
        stAt: now + rand(6000, 10000),
        wantPn: null,
        wantBlink: false,
        dragCycle: -1,
        notifyPop: false,
        wantBurst: null,
        wakingBurst: false,
      };
    }

    setMode(mode) {
      this.mode = mode;
      if (mode === "onboarding") {
        this.moodN = 0;
        this.stateAt = performance.now();
        this.setState("idle", { resetEyes: true });
      }
    }

    setPaused(v) {
      const paused = !!v;
      if (paused === this.paused) return;
      this.paused = paused;
      if (paused) {
        if (this._raf !== null) cancelAnimationFrame(this._raf);
        this._raf = null;
      } else {
        this.last = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));
      }
    }

    setReduceMotion(v) {
      this.reduceMotion = !!v;
      this.particles?.setReduceMotion(this.reduceMotion);
    }

    setEmphasis(v) {
      this.emphasis = !!v;
    }

    setFollowPointer(v) {
      this.followPointer = !!v;
      if (!v) {
        this.pointerRaw = null;
        this.gazeTarget = null;
      }
    }

    setGazeTarget(pt) {
      this.gazeTarget = pt;
    }

    setShape(name) {
      if (!g.GROK_GEO.shapes[name] || name === this.shapeName) return;
      const R = g.GROK_GEO.Re;
      const k = K2(clamp(this.shapeSpring.x, 0, 1));
      const rest = FX.shapeMetrics(g.GROK_GEO.shapes[this.shapeName], R);
      if (k >= 1 || !this.prevFace || !this.prevRing) {
        this.prevFace = rest.face;
        this.prevRing = rest.ring;
        this.prevTilt = rest.tilt;
        this.prevBelt = rest.belt;
      } else {
        this.prevFace = lerpFace(this.prevFace, rest.face, k);
        this.prevRing = FX.lerpRing(this.prevRing, rest.ring, k);
        this.prevTilt += (rest.tilt - this.prevTilt) * k;
        this.prevBelt += (rest.belt - this.prevBelt) * k;
      }
      this.prevShape = this.shapeName;
      this.shapeName = name;
      this.shapeSpring.x = 0;
      this.shapeSpring.v = 0;
      this.shapeSpring.t = 1;
      if (this.loginWrap) this.eyeScaleProp = shapeEyeScale(name);
      this._applyPoseScale();
      this._cycleShapeTrick();
    }

    setColor(id, scheme) {
      this.colorId = id;
      if (scheme) this.scheme = scheme;
      if (this.inkFlat) {
        this.svg.style.setProperty("--fg", this.inkFlat);
      } else if (this.loginWrap) {
        this.svg.style.setProperty("--fg", inkFg(id));
      } else {
        const pal = g.GROK_GEO.palette[id] || g.GROK_GEO.palette.black;
        this.svg.style.setProperty("--fg", this.scheme === "dark" ? pal.dark : pal.light);
      }
      this.svg.style.setProperty("--ink", inkCss(id));
      this.svg.style.setProperty("--bg", this.eyeColor || EYE_BG);
    }

    setInk(flat) {
      this.inkFlat = flat || null;
      this.setColor(this.colorId);
    }

    setEyeColor(color) {
      this.eyeColor = color || null;
      this.svg.style.setProperty("--bg", this.eyeColor || EYE_BG);
    }

    setState(name, options = {}) {
      this.setScene({ pose: name, expression: name, effect: name, gaze: name }, options);
    }

    setScene(scene, { resetEyes = false } = {}) {
      const hasEffect = Object.prototype.hasOwnProperty.call(scene, "effect");
      const pose = scene.pose ?? this.poseState ?? this.state;
      const expression = scene.expression ?? this.expressionState ?? pose;
      const effect = hasEffect ? scene.effect : (this.poseState === null ? pose : this.effectState);
      const gaze = scene.gaze ?? this.gazeState ?? expression;
      if (!EYE_PLAYLIST[pose] || !EYE_PLAYLIST[expression] || !EYE_PLAYLIST[gaze]) return;
      if (effect !== null && !EYE_PLAYLIST[effect]) return;

      const poseChanged = pose !== this.poseState;
      const expressionChanged = expression !== this.expressionState;
      const effectChanged = effect !== this.effectState;
      const gazeChanged = gaze !== this.gazeState;
      if (!poseChanged && !expressionChanged && !effectChanged && !gazeChanged && !resetEyes) return;

      const now = performance.now();
      this.state = pose;
      this.stateAt = now;
      this.poseState = pose;
      this.expressionState = expression;
      this.effectState = effect;
      this.gazeState = gaze;

      if (poseChanged) {
        this.poseAt = now;
        this.ctx = this._freshCtx(now);
        this.ctx.stAt = now + (
          pose === "excited" ? rand(400, 1100)
          : pose === "searching" ? rand(800, 1600)
          : pose === "working" ? rand(1200, 2400)
          : rand(6000, 10000)
        );
        this.celebrateAt = pose === "celebrate" ? now + 140 : -1;
        this.trick = null;
        this.spinTurn = null;
        this.hopAt = -1;
        this.wildWide = false;
      }

      if (expressionChanged || resetEyes) {
        const list = EYE_PLAYLIST[expression];
        this.eyeIdx = 0;
        if (resetEyes) {
          this.eyeFrom = list[0];
          this.eyeTo = list[0];
          this._fromPolys = null;
          this.eyeMorph.x = 1;
          this.eyeMorph.t = 1;
          this.eyeMorph.v = 0;
        } else if (expression !== "sleeping" && expression !== "waking") {
          this._morphEyes(list[0], expression === "excited" ? 10 : 8);
        }
        this.eyeUntil = now + rand(...EYE_HOLD_MS[expression]);
        const blink = BLINK_MS[expression];
        this.blinkUntil = blink ? now + rand(1500, 7000) : Infinity;
        this.winkUntil = now + rand(3000, 8000);
        if (
          expression !== "waking"
          && expression !== "sleeping"
          && expression !== "drowsy"
          && expression !== "winking"
        ) {
          EY.queueBlink(this.blinkQueue, now);
        }
      }

      if (effectChanged) {
        if (effect !== null) this.effectAt = now;
        if (effect !== null && effect !== "writing") this.fx?.resetInk();
      }
      if (gazeChanged) this.gazeUntil = now + rand(500, 1400);

      try {
        this.onChange(this.snapshot());
      } catch (_) { /* host UI may not be ready */ }
    }

    snapshot() {
      return {
        state: this.state,
        pose: this.poseState,
        expression: this.expressionState,
        effect: this.effectState,
        gaze: this.gazeState,
        mode: this.mode,
        shape: this.shapeName,
        color: this.colorId,
        scheme: this.scheme,
        eyeFrom: this.eyeFrom,
        eyeTo: this.eyeTo,
        spin: this.spin.x,
        tx: this.tx.x,
        ty: this.ty.x,
        squash: this.squash.x,
        blink: this.blink.x,
        overlay: this.ovKind,
      };
    }

    winkOnce(eye = Math.random() < 0.5 ? 0 : 1) {
      this.blinkQueue.length = 0;
      this.blink.x = 1;
      this.blink.v = 0;
      this.blink.t = 1;
      this.winkAt = performance.now();
      this.winkEye = eye === 0 ? 0 : 1;
    }

    spinOnce(turns = 1) {
      this._pn(turns);
    }
    bounceOnce() {
      this._hop(performance.now());
    }
    burstOnce() {
      if (!this.reduceMotion) this.particles.burst(22, 1.1, 0.3);
    }

    _applyPoseScale() {
      const sc = this.loginWrap ? poseScale(this.shapeName) : (this.pose.scale || 1);
      this.pose.scale = sc;
      if (this.sizePx) {
        this.svg.style.width = `${this.sizePx}px`;
        this.svg.style.height = `${this.sizePx}px`;
      }
      if (Math.abs(sc - 1) > 0.001) {
        this.svg.style.transform = `scale(${sc})`;
        this.svg.style.transformOrigin = "50% 50%";
      } else {
        this.svg.style.transform = "";
      }
    }

    _bindPointer() {
      this._onMove = (e) => {
        if (!this.followPointer) return;
        this.pointerRaw = { x: e.clientX, y: e.clientY };
      };
      this._onLeave = () => {
        if (this.followPointer) this.pointerRaw = null;
      };
      window.addEventListener("pointermove", this._onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", this._onLeave);
    }

    _unbindPointer() {
      window.removeEventListener("pointermove", this._onMove);
      document.documentElement.removeEventListener("pointerleave", this._onLeave);
    }

    _build() {
      const geo = g.GROK_GEO;
      const vb = geo.viewBox;
      this.svg.setAttribute("viewBox", `${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`);
      this.svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      this.svg.style.overflow = "visible";
      this.svg.innerHTML = "";
      const ns = "http://www.w3.org/2000/svg";
      const defs = document.createElementNS(ns, "defs");
      const clip = document.createElementNS(ns, "clipPath");
      const clipId = `grok-clip-${Math.random().toString(36).slice(2, 8)}`;
      clip.setAttribute("id", clipId);
      this.clipPath = document.createElementNS(ns, "path");
      clip.appendChild(this.clipPath);
      defs.appendChild(clip);
      this.svg.appendChild(defs);

      this.group = document.createElementNS(ns, "g");
      this.body = document.createElementNS(ns, "path");
      this.body.setAttribute("fill", "var(--fg, #000)");
      const eyesG = document.createElementNS(ns, "g");
      eyesG.setAttribute("clip-path", `url(#${clipId})`);
      this.eyeEls = [0, 1].map(() => {
        const p = document.createElementNS(ns, "path");
        p.setAttribute("fill", "var(--bg, #f3efe6)");
        eyesG.appendChild(p);
        return p;
      });
      this.badge = document.createElementNS(ns, "circle");
      this.badge.setAttribute("style", "display:none");
      this.group.appendChild(this.body);
      this.group.appendChild(eyesG);
      this.group.appendChild(this.badge);

      this.fx = new FX.OverlayLayer();
      const R = geo.Re;
      this.fx.circlePath = FX.circlePathOf(R);
      this.fx.pencilPath = FX.capsule(30, 88, R);
      this.fx.bangPath = FX.taper(30, 17, 96, R);
      this.fx.attach(this.svg, this.group);
      this.particles = FX.createParticles({
        back: this.fx.back,
        front: this.fx.front,
        idPrefix: this.fx.uid,
        getRadius: () => {
          const sh = geo.shapes[this.shapeName];
          const k = K2(clamp(this.shapeSpring.x, 0, 1));
          const to = sh?.beltRadius || FX.beltRadius(sh.path, R);
          let je = k < 0.999 && this.prevBelt != null
            ? this.prevBelt + (to - this.prevBelt) * k
            : to;
          if (this.effectState === "loading") je += (52 - je) * clamp(this.overlay.x, 0, 1);
          return je;
        },
      });
      this.body.setAttribute("d", geo.shapes[this.shapeName].path);
      this.clipPath.setAttribute("d", geo.shapes[this.shapeName].path);
    }

    _morphEyes(index, stiffness = 7) {
      if (index === this.eyeTo && this.eyeMorph.t === 1) return;
      const t = clamp(this.eyeMorph.x, 0, 1);
      this.eyeFrom = this.eyeTo;
      this._fromPolys = this._currentPolys(t);
      this.eyeTo = index;
      this.eyeMorph.x = 0;
      this.eyeMorph.v = 0;
      this.eyeMorph.t = 1;
      this.eyeStiffness = stiffness;
    }

    _currentPolys(t) {
      const eyes = g.GROK_GEO.eyes;
      const from = this._fromPolys || eyes[this.eyeFrom];
      const to = eyes[this.eyeTo];
      return [lerpPoly(from[0], to[0], t), lerpPoly(from[1], to[1], t)];
    }

    _pn(turns = 1, dir = sign()) {
      if (this.reduceMotion || this.paused || this.spinTurn) return;
      this.spinTurn = TR.makeSpinTurn(turns, dir);
    }

    _hop(now) {
      if (this.hopAt < 0) this.hopAt = now;
    }

    _cycleShapeTrick() {
      if (this.reduceMotion || this.paused) return;
      this.trickCycle = (this.trickCycle + 1) % 5;
      this.wildWide = false;
      if (this.trickCycle === 0) this._pn(1);
      else if (this.trickCycle === 1) {
        this.wildWide = true;
        this._pn(2);
      } else if (this.trickCycle === 2) this.trick = TR.startTrick("spinBounce", this.reduceMotion);
      else if (this.trickCycle === 3) this.trick = TR.startTrick("spinDizzy", this.reduceMotion);
      else {
        this._pn(1);
        this.particles.burst(16, 0.95, 0.3);
      }
    }

    _stepOverlay(now) {
      const want = FX.MAP[this.effectState] || null;
      if (want !== this.ovTarget) {
        this.ovTarget = want;
        this.fx.overlayAt = now;
        this.ovRest = false;
        this.ovRestAt = 0;
      }
      let on = want != null;
      if (want && FX.CYCLE.has(this.effectState)) {
        if (!this.ovRest && now - this.fx.overlayAt > (FX.CYCLE_ON[this.effectState] || 2500)) {
          this.ovRest = true;
          this.ovRestAt = now;
        } else if (this.ovRest && now - this.ovRestAt > FX.CYCLE_OFF) {
          this.ovRest = false;
          this.fx.overlayAt = now;
        }
        on = !this.ovRest;
      }
      this.overlay.t = on ? 1 : 0;
      if (on !== this.ovOn) {
        if (!this.reduceMotion) {
          if (on) this.ovTurnDir = sign();
          this.ovTurnAcc += Math.PI * this.ovTurnDir;
          this.overlayTurn.t = this.ovTurnAcc;
        }
        this.ovOn = on;
      }
      if (want && want !== this.ovKind) {
        if (this.ovKind && this.overlay.x > 0.02) {
          this.ovPrev = this.ovKind;
          this.overlayMix.x = 0;
          this.overlayMix.v = 0;
          this.overlayMix.t = 1;
        } else {
          this.ovPrev = null;
          this.overlayMix.x = 1;
          this.overlayMix.v = 0;
          this.overlayMix.t = 1;
        }
        this.ovKind = want;
        this.fx.overlayAt = now;
        if (want !== "pencil") this.fx.resetInk();
      }
      if (!want && this.overlay.x < 0.004) {
        if (this.ovKind === "pencil" || this.ovPrev === "pencil") this.fx.resetInk();
        this.ovKind = null;
        this.ovPrev = null;
      }
      if (this.overlayMix.x > 0.996) this.ovPrev = null;
    }

    _updatePointer(now) {
      const src = this.gazeTarget || (this.followPointer ? this.pointerRaw : null);
      if (src && this.svg.getBoundingClientRect) {
        if (now - this.rectAt > 200) {
          this.rectCache = this.svg.getBoundingClientRect();
          this.rectAt = now;
        }
        const rect = this.rectCache;
        if (rect && rect.width > 0) {
          const mapped = this.gazeTarget ? src : mapPointer(rect, src);
          this.pointer.tx = clamp((mapped.x - (rect.left + rect.width / 2)) / rect.width, -0.6, 0.6) * 22;
          this.pointer.ty = clamp((mapped.y - (rect.top + rect.height / 2)) / rect.height, -0.6, 0.6) * 14;
        }
      } else {
        this.pointer.tx = 0;
        this.pointer.ty = 0;
      }
      const z = Rn(0.16);
      this.pointer.x += (this.pointer.tx - this.pointer.x) * z;
      this.pointer.y += (this.pointer.ty - this.pointer.y) * z;
    }

    _tick(now) {
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;

      if (this.paused) {
        this._raf = null;
        return;
      }

      if (this.mode === "onboarding" && now - this.stateAt >= ONBOARDING_MS) {
        this.moodN += 1;
        this.setState(onboardMood(this.moodN));
      }

      const mt = (now - this.t0) / 1000;
      const dtState = (now - this.poseAt) / 1000;
      const dtEffect = (now - this.effectAt) / 1000;
      const pose = applyPose(this.poseState, mt, dtState, now, this.ctx, {
        eyeTo: this.eyeTo,
        eyeMorphX: this.eyeMorph.x,
        blinkX: this.blink.x,
        effectState: this.effectState,
      });
      this.spin.t = pose.spin;
      this.tx.t = pose.tx;
      this.ty.t = pose.ty;
      this.squash.t = pose.squash;
      this.eyeScale.t = pose.eyeBoost;
      if (this.ctx.tyKick) {
        this.ty.v += this.ctx.tyKick;
        this.ctx.tyKick = 0;
      }
      if (this.ctx.spinKick) {
        this.spin.v += this.ctx.spinKick;
        this.ctx.spinKick = 0;
      }
      if (this.ctx.forceSleepEye) {
        this.ctx.forceSleepEye = false;
        this._morphEyes(13, 11);
      }
      if (this.ctx.wakeEye) {
        this._morphEyes(this.ctx.wakeEye[0], this.ctx.wakeEye[1]);
        this.ctx.wakeEye = null;
      }
      if (this.ctx.wakeBlink && !this.ctx.wakingBlinked && this.blinkQueue.length === 0) {
        EY.queueBlink(this.blinkQueue, now);
        this.ctx.wakingBlinked = true;
      }
      this.ctx.wakeBlink = false;
      if (this.ctx.wantBlink) {
        EY.queueBlink(this.blinkQueue, now);
        this.ctx.wantBlink = false;
      }
      if (this.ctx.wantPn) {
        this._pn(...this.ctx.wantPn);
        this.ctx.wantPn = null;
      }
      if (this.ctx.wantBurst) {
        this.particles.burst(this.ctx.wantBurst[0], this.ctx.wantBurst[1]);
        this.ctx.wakingBurst = true;
        this.ctx.wantBurst = null;
      }

      this._stepOverlay(now);

      if (this.celebrateAt > 0 && now >= this.celebrateAt && !this.trick && !this.spinTurn) {
        this.trick = TR.startTrick("spinWild", this.reduceMotion);
        this.celebrateAt = now + 6200;
      }

      if (now >= this.trickAt) {
        if ((V_T.has(this.poseState) || B_T.has(this.poseState)) && !this.spinTurn && this.hopAt < 0 && !this.trick) {
          const z = Math.random();
          if (V_T.has(this.poseState)) {
            if (z < 0.55) this._pn(1);
            else this.trick = TR.startTrick("spinBounce", this.reduceMotion);
          } else if (z < 0.34) this.trick = TR.startTrick("spinBounce", this.reduceMotion);
          else if (z < 0.62) this._hop(now);
          else if (z < 0.86) this.trick = TR.startTrick("spinDizzy", this.reduceMotion);
          else this._pn(1);
        }
        this.trickAt = now + rand(9000, 18000);
      }

      const tf = TR.evalTrick(this.trick, now);
      if (tf.wantHop) this._hop(now);
      if (tf.done) this.trick = null;
      let hop = TR.hopY(this.hopAt, now);
      if (hop == null) {
        this.hopAt = -1;
        hop = 0;
      }
      let turn = tf.turn;
      if (this.spinTurn) {
        turn = (turn ?? 0) + this.spinTurn.x;
        if (TR.spinTurnSettled(this.spinTurn)) this.spinTurn = null;
      }
      this.extras = { ...tf, turn, hop };

      if (this.extras.eyeBoost != null) this.eyeScale.t = this.extras.eyeBoost;

      if (this.expressionState !== "waking" && this.expressionState !== "sleeping" && now >= this.eyeUntil) {
        const list = EYE_PLAYLIST[this.expressionState];
        this.eyeIdx = (this.eyeIdx + 1 + Math.floor(rand(0, list.length - 1))) % list.length;
        const stiff = this.expressionState === "searching" || this.expressionState === "excited" ? 10 : 6;
        this._morphEyes(list[this.eyeIdx], stiff);
        this.eyeUntil = now + rand(...EYE_HOLD_MS[this.expressionState]);
      }

      const blinkCadence = BLINK_MS[this.expressionState];
      if (blinkCadence && now >= this.blinkUntil) {
        EY.queueBlink(this.blinkQueue, now);
        this.blinkUntil = now + rand(...blinkCadence);
      }
      const blinkKey = EY.consumeBlink(this.blinkQueue, now);
      this.blink.t = blinkKey ?? (this.blinkQueue.length ? this.blink.t : (this.extras.lidMul ?? pose.lid));

      if (now >= this.gazeUntil) {
        const gz = nextGaze(this.gazeState);
        this.gazeX.t = gz.x;
        this.gazeY.t = gz.y;
        this.gazeUntil = now + rand(...gz.hold);
      }

      if (WINK_STATES.has(this.expressionState) && now >= this.winkUntil) {
        this.winkAt = now;
        this.winkEye = Math.random() < 0.5 ? 0 : 1;
        this.winkUntil = now + rand(4500, 10000);
      }

      this.emphasisBlend += ((this.emphasis ? 1 : 0) - this.emphasisBlend) * Rn(0.12);

      if (this.emphasis) {
        this.eyeScale.t = Math.max(this.eyeScale.t, 1.32);
        this.blink.t = Math.max(this.blink.t, 1.18);
      }

      const humming = this.effectState === "humming";
      const loading = this.effectState === "loading";
      if ((humming || loading) && !this.reduceMotion) {
        const Zt = dtEffect;
        const dn = loading ? 3 : 1.6;
        const on = Zt < 0.5 ? 7 * K2(Zt / 0.5) : Zt < 1.3 ? 7 + (dn - 7) * K2((Zt - 0.5) / 0.8) : dn + 0.3 * Math.sin(Zt * 0.5);
        this.ovSpin += on * dt;
      }

      if (this.reduceMotion) {
        this._morphEyes(EYE_PLAYLIST[this.expressionState][0]);
        this.spin.t = 0; this.tx.t = 0; this.ty.t = 0;
        this.squash.t = 1; this.blink.t = 1; this.eyeScale.t = 1;
      }

      const nSteps = springSteps(dt);
      const step = dt / nSteps;
      for (let i = 0; i < nSteps; i++) {
        stepSpring(this.eyeMorph, this.eyeStiffness, 1, step);
        if (this.spinTurn) stepSpring(this.spinTurn, ...SPRINGS.spinTurn, step);
        stepSpring(this.spin, ...SPRINGS.spin, step);
        stepSpring(this.tx, ...SPRINGS.x, step);
        stepSpring(this.ty, ...SPRINGS.y, step);
        stepSpring(this.squash, ...SPRINGS.squash, step);
        stepSpring(this.blink, ...SPRINGS.blink, step);
        stepSpring(this.eyeScale, ...SPRINGS.eyeScale, step);
        stepSpring(this.notify, ...SPRINGS.notify, step);
        stepSpring(this.humDots, ...SPRINGS.humDots, step);
        stepSpring(this.gazeX, ...SPRINGS.gazeX, step);
        stepSpring(this.gazeY, ...SPRINGS.gazeY, step);
        stepSpring(this.overlay, ...SPRINGS.overlay, step);
        stepSpring(this.overlayMix, ...SPRINGS.overlayMix, step);
        stepSpring(this.shapeSpring, ...SPRINGS.shape, step);
        stepSpring(this.overlayTurn, ...SPRINGS.overlayTurn, step);
      }
      if (this.reduceMotion) {
        this.overlayMix.x = 1;
        this.overlayTurn.x = this.overlayTurn.t;
        this.overlay.x = this.overlay.t;
      }
      this.notify.t = this.effectState === "notifying" ? 1 : 0;
      this.humDots.t = this.effectState === "humming" ? 1 : 0;

      let spinAngle = 0;
      if (this.spinTurn) spinAngle = this.spinTurn.x;
      else if (this.extras.turn != null) spinAngle = this.extras.turn;
      else if (humming || loading) spinAngle = this.ovSpin;
      if (now - this.pxAt > 500 && this.svg.getBoundingClientRect) {
        const w = this.svg.getBoundingClientRect().width;
        if (w > 0) {
          this.pxW = w;
          this.partScale = clamp(Math.pow(340 / w, 0.7), 1, 2.6);
        }
        this.pxAt = now;
      }
      this.particles.update(now, dt, {
        spinAngle,
        sizeScale: this.partScale,
        wideStyle: this.trick?.kind === "spinWild" || this.wildWide || humming,
        sustainBelts: humming || loading,
      });

      this._updatePointer(now);
      this._paint(now);
      this._raf = this.paused ? null : requestAnimationFrame((t) => this._tick(t));
    }

    _paint(now) {
      const geo = g.GROK_GEO;
      const R = geo.Re;
      const shape = geo.shapes[this.shapeName];
      const morphK = K2(clamp(this.shapeSpring.x, 0, 1));
      const morphing = morphK < 0.999 && this.prevFace;
      const face = morphing ? lerpFace(this.prevFace, shape.face, morphK) : shape.face;
      const fromTilt = this.prevTilt ?? (geo.shapes[this.prevShape]?.tiltScale || 1);
      const tilt = morphing
        ? fromTilt + ((shape.tiltScale || 1) - fromTilt) * morphK
        : (shape.tiltScale || 1);
      const yl = clamp(this.overlay.x, 0, 1);
      const mix = clamp(this.overlayMix.x, 0, 1);
      this.fx._reduce = this.reduceMotion;
      const ov = this.fx.extras(now, this.effectAt, this.ovKind, this.ovPrev, yl, mix);
      const bodyW = 1 - yl;
      const ex = this.extras;
      const tx = this.tx.x * bodyW + ex.yi * bodyW + ov.yre * yl;
      const ty = (this.ty.x + ex.hop) * bodyW + ex.ki * bodyW - ov.rX.lift * ov.Lee + ov.aX * yl;
      const rot = (this.spin.x * bodyW + ex.Kr * bodyW) * tilt + (ex.Yr || 0) * bodyW + ov.wl * yl;
      const sx = bodyW + ov.wre * yl;
      const sy = this.squash.x * bodyW + ov.wre * yl;
      this.group.setAttribute(
        "transform",
        `translate(${(R + tx).toFixed(2)} ${(R + ty).toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-R} ${-R})`
      );
      this.group.style.opacity = ((1 - (1 - ov.rX.tone) * ov.Lee) * (1 - ov.fade)).toFixed(3);

      const Jc = clamp(yl / FX.P_BLEND, 0, 1);
      const pencil = this.ovKind === "pencil" || this.ovPrev === "pencil";
      const tear = geo.shapes.teardrop?.path;
      const spinAmt = ex.turn;
      const spinning = spinAmt != null;
      const restRing = morphing
        ? FX.lerpRing(this.prevRing, FX.shapeRing(shape.path, R), morphK)
        : FX.shapeRing(shape.path, R);
      let liveRing = restRing;
      let turned = false;
      const turnAt = !morphing && spinning ? FX.turnAtOf(this.shapeName, shape.path, R) : null;
      if (turnAt) {
        liveRing = turnAt(spinAmt);
        turned = true;
      }
      let faceTop = shape.top;
      let faceBottom = shape.bottom;
      if (morphing || turned) {
        faceTop = Infinity;
        faceBottom = -Infinity;
        for (const p of liveRing) {
          if (p[1] < faceTop) faceTop = p[1];
          if (p[1] > faceBottom) faceBottom = p[1];
        }
      }
      let bodyD;
      if (Jc >= 1) {
        bodyD = pencil ? FX.closedSpline(FX.overlayRing(this.ovKind, R, tear)) : this.fx.circlePath;
      } else if (Jc <= 0 && !morphing && !turned) {
        bodyD = shape.path;
      } else {
        const to = FX.overlayRing(this.ovKind || this.ovPrev, R, tear);
        bodyD = FX.closedSpline(Jc <= 0 ? liveRing : FX.lerpRing(liveRing, to, K2(Jc)));
      }
      this.body.setAttribute("d", bodyD);
      this.clipPath.setAttribute("d", bodyD);

      this.fx.paint(now, this.effectAt, this.ovKind, this.ovPrev, yl, mix, R, this.reduceMotion);

      const shrink = 1 - Dke(clamp((this.pxW - 44) / 90, 0, 1));
      const pScale = this.pose.scale || 1;
      const zCur = overlayViewZoom(this.ovKind, pScale);
      const zPrev = overlayViewZoom(this.ovPrev, pScale);
      const zoom = 1 + (zCur * mix + zPrev * (1 - mix) - 1) * yl * shrink;
      const half = VIEW_HALF / zoom;
      this.svg.setAttribute("viewBox", `${(VIEW_MID - half).toFixed(2)} ${(VIEW_MID - half).toFixed(2)} ${(half * 2).toFixed(2)} ${(half * 2).toFixed(2)}`);

      const morphT = clamp(this.eyeMorph.x, 0, 1);
      const polys = this._currentPolys(morphT);
      const cr = this.eyeTopology ? relRot(this.pose, this.poseHome) : null;
      const overlayLive = yl > 0.001 || Math.abs(this.overlayTurn.t - this.overlayTurn.x) > 0.01;
      let cyl = overlayLive ? this.overlayTurn.x : null;
      if (ex.turn != null) cyl = (cyl ?? 0) + ex.turn;
      const ringHint = morphing || turned ? liveRing : null;
      const hasPtr = !!(this.gazeTarget || (this.followPointer && this.pointerRaw));
      EY.paintEyes({
        now,
        polys,
        morphT,
        shape,
        face,
        faceTune: this.faceTune,
        uniformEyes: this.uniformEyes,
        eyeScaleProp: this.eyeScaleProp,
        blinkX: this.blink.x,
        eyeBoostX: this.eyeScale.x,
        gazeX: this.gazeX.x,
        gazeY: this.gazeY.x,
        winkAt: this.winkAt,
        winkEye: this.winkEye,
        turn: cyl,
        cr,
        pointer: hasPtr ? this.pointer : null,
        notifyX: this.notify.x,
        overlayX: this.overlay.x,
        eyeEls: this.eyeEls,
        badgeEl: this.badge,
        badgeColor: this.badgeColor,
        Re: R,
        G9e: geo.G9e,
        VJt: geo.VJt,
        extras: ex,
        ringHint,
        badgeRing: restRing,
        top: faceTop,
        bottom: faceBottom,
        emphasisBlend: this.emphasisBlend,
      });

      const hum = clamp(this.humDots.x, 0, 1);
      if (hum > 0.01) {
        for (let i = 0; i < 2; i++) {
          const el = this.fx.parts[3 + i];
          if (!el) continue;
          const Gn = this.ovSpin * 0.85 + i * Math.PI;
          const Ti = shape.radius * 1.3;
          const Ui = Math.cos(Gn);
          const Si = 0.55 + 0.45 * clamp((Ui + 1) / 2, 0, 1);
          el.style.display = "";
          el.setAttribute("cx", (R + Ti * Math.sin(Gn)).toFixed(1));
          el.setAttribute("cy", (R - Ti * 0.38 * Math.cos(Gn) - 8).toFixed(1));
          el.setAttribute("r", (7.5 * Si * hum).toFixed(2));
          el.setAttribute("opacity", ((0.3 + 0.7 * Si) * hum).toFixed(3));
        }
      }
    }
  }

  g.GrokCharacter = GrokCharacter;
  g.GROK_META = {
    groups: GROUPS,
    onboarding: ONBOARDING,
    onboardingMs: ONBOARDING_MS,
    eyePlaylist: EYE_PLAYLIST,
    springs: SPRINGS,
    faceTune: FACE_TUNE,
    pose: POSE,
    poseHome: POSE_HOME,
    overlays: FX.MAP,
  };
})(window);
