/* 动画运行时。解析控制通道、推进弹簧并协调一次性动作。 */
(function (g) {
  const M = g.GROK_MATH;
  const T = g.GROK_TABLES;
  const MOTION = g.GROK_MOTION;
  const EXPRESSION = g.GROK_EXPRESSION;
  const { next: nextGaze } = g.GROK_GAZE;
  const CHOREOGRAPHY = g.GROK_CHOREOGRAPHY;
  const ACTIONS = g.GROK_ACTIONS;
  const EY = g.GROK_EYES;
  const FX = g.GROK_EFFECTS;
  const RENDER = g.GROK_RENDER;
  const GEO = g.GROK_GEOMETRY;
  const {
    spring, stepSpring, springSteps, clamp, rand, sign, K2, mapPointer, Rn,
  } = M;
  const { lerpPoly, lerpFace } = GEO;
  const {
    GROUPS, EYE_PLAYLIST, EYE_HOLD_MS, BLINK_MS,
    ONBOARDING, ONBOARDING_MS, onboardMood,
    SPRINGS, FACE_TUNE, POSE, POSE_HOME, UNIFORM_EYES,
    WINK_STATES, poseScale, shapeEyeScale,
    inkFg, inkCss, EYE_BG,
  } = T;

  class GrokCharacter {
    constructor(svg, opts = {}) {
      this.svg = svg;
      this.shapeName = opts.shape || "blob";
      this.colorId = opts.color || "black";
      this.scheme = opts.scheme || "light";
      this.mode = opts.mode || "onboarding";
      this.state = opts.state || "idle";
      this.motionState = null;
      this.expressionState = null;
      this.faceState = null;
      this.gazeState = null;
      this.formState = null;
      this.decorationState = null;
      this.particleState = null;
      this.cameraState = null;
      this.badgeState = null;
      this.effectId = null;
      this.sceneDirection = 0;
      this.sceneVariant = null;
      this.faceRoll = 0;
      this.eyeLids = null;
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
      this.pausedAt = null;
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
      this.formBlend = spring(0);
      this.formMix = spring(1);
      this.decorationBlend = spring(0);
      this.decorationMix = spring(1);
      this.cameraBlend = spring(0);
      this.cameraMix = spring(1);
      this.notify = spring(0);
      this.humDots = spring(0);
      this.shapeSpring = spring(1);
      this.formTurn = spring(0);
      this.emphasisBlend = 0;

      this.eyeFrom = 0;
      this.eyeTo = 0;
      this.eyeStiffness = 7;
      this.eyeIdx = 0;
      this._fromPolys = null;

      this.t0 = performance.now();
      if (this.paused) this.pausedAt = this.t0;
      this.stateAt = this.t0;
      this.motionAt = this.t0;
      this.faceAt = this.t0;
      this.formAt = this.t0;
      this.decorationAt = this.t0;
      this.particleAt = this.t0;
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
      this.trickCycle = Math.floor(rand(0, 5));
      this.wildWide = false;
      this.effectSpinRadians = 0;
      this.formTurnAccumulator = 0;
      this.formVisible = false;
      this.formTurnDirection = 1;
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
      this.formKind = null;
      this.formPrev = null;
      this.formTarget = null;
      this.decoKind = null;
      this.decoPrev = null;
      this.cameraKind = null;
      this.cameraPrev = null;
      this.formRest = false;
      this.formRestAt = 0;
      this.pxW = 190;
      this.pxAt = 0;
      this.partScale = 1;
      this.celebrateAt = -1;
      this.extras = {
        turnRadians: null,
        rollOffsetDeg: 0,
        xOffsetPx: 0,
        yOffsetPx: 0,
        freeRollDeg: 0,
        gazeXPx: 0,
        gazeYPx: 0,
        hopYPx: 0,
      };

      RENDER.build(this);
      this.setColor(this.colorId, this.scheme);
      this._applyPoseScale();
      this.setState(this.state, { resetEyes: true });
      this._bindPointer();
      RENDER.paint(this, this.t0);
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
        idleShiftAt: now + rand(7000, 15_000),
        idleShiftEnd: 0,
        idleShiftDuration: 1,
        idleShiftDirection: 1,
        sleepTwitchAt: now + rand(18_000, 34_000),
        sleepTwitchEnd: 0,
        angryShakeUntil: 0,
        impulseAt: now + rand(500, 1200),
        wakingBlinked: false,
        slumpAt: 0,
        stAt: now + rand(6000, 10000),
        dragCycle: -1,
        notifyPop: false,
        notifyBlink: false,
        wakingBurst: false,
        stretchBlinked: false,
        quizzicalBlinked: false,
      };
    }

    _now() {
      return this.paused && this.pausedAt !== null ? this.pausedAt : performance.now();
    }

    setMode(mode) {
      this.mode = mode;
      if (mode === "onboarding") {
        this.moodN = 0;
        this.stateAt = this._now();
        this.setState("idle", { resetEyes: true });
      }
    }

    setPaused(v) {
      const paused = !!v;
      if (paused === this.paused) return;
      this.paused = paused;
      if (paused) {
        this.pausedAt = performance.now();
        this.particles?.setPaused(true, this.pausedAt);
        if (this._raf !== null) cancelAnimationFrame(this._raf);
        this._raf = null;
      } else {
        const resumedAt = performance.now();
        const delta = this.pausedAt === null ? 0 : resumedAt - this.pausedAt;
        this.pausedAt = null;
        for (const key of [
          "t0", "stateAt", "motionAt", "faceAt", "formAt", "decorationAt", "particleAt", "eyeUntil", "blinkUntil", "gazeUntil",
          "winkUntil", "formRestAt", "celebrateAt",
        ]) {
          if (Number.isFinite(this[key]) && this[key] > -1e8) this[key] += delta;
        }
        if (this.winkAt > -1e8) this.winkAt += delta;
        if (this.fx && this.fx.overlayAt > 0) this.fx.overlayAt += delta;
        if (this.hopAt >= 0) this.hopAt += delta;
        if (this.trick) this.trick.t0 += delta;
        for (const key of [
          "nodUntil", "nodEnd", "angryShakeUntil", "impulseAt", "slumpAt", "stAt",
          "idleShiftAt", "idleShiftEnd", "sleepTwitchAt", "sleepTwitchEnd",
        ]) {
          if (this.ctx[key] > 0) this.ctx[key] += delta;
        }
        for (const blink of this.blinkQueue) blink.at += delta;
        this.particles?.setPaused(false, resumedAt);
        this.last = resumedAt;
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
      const rest = GEO.shapeMetrics(this.shapeName);
      if (k >= 1 || !this.prevFace || !this.prevRing) {
        this.prevFace = rest.face;
        this.prevRing = rest.ring;
        this.prevTilt = rest.tilt;
        this.prevBelt = rest.belt;
      } else {
        this.prevFace = lerpFace(this.prevFace, rest.face, k);
        this.prevRing = GEO.lerpRing(this.prevRing, rest.ring, k);
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
      this.setPreset(g.GROK_PRESETS.fromState(name), options);
    }

    setPreset(preset, options = {}) {
      const scene = g.GROK_PRESETS.resolve(preset);
      if (scene) this._applyComposition(scene, options);
    }

    _applyComposition(scene, { resetEyes = false } = {}) {
      const motion = scene.motion ?? this.motionState ?? this.state;
      const expression = scene.expression ?? this.expressionState ?? motion;
      const face = scene.face ?? this.faceState ?? motion;
      const gaze = scene.gaze ?? this.gazeState ?? expression;
      const form = scene.form ?? null;
      const decoration = scene.decoration ?? null;
      const particles = scene.particles ?? null;
      const camera = scene.camera ?? null;
      const badge = scene.badge ?? null;
      const effect = scene.effect ?? null;
      const direction = scene.direction === -1 || scene.direction === 1 ? scene.direction : 0;
      const variant = typeof scene.variant === "string" ? scene.variant : null;
      if (!EYE_PLAYLIST[expression]) return;

      const motionChanged = motion !== this.motionState;
      const expressionChanged = expression !== this.expressionState;
      const faceChanged = face !== this.faceState;
      const formChanged = form !== this.formState;
      const decorationChanged = decoration !== this.decorationState;
      const particleChanged = particles !== this.particleState;
      const cameraChanged = camera !== this.cameraState;
      const badgeChanged = badge !== this.badgeState;
      const effectIdChanged = effect !== this.effectId;
      const gazeChanged = gaze !== this.gazeState;
      const performanceChanged = direction !== this.sceneDirection || variant !== this.sceneVariant;
      if (
        !motionChanged
        && !expressionChanged
        && !faceChanged
        && !formChanged
        && !decorationChanged
        && !particleChanged
        && !cameraChanged
        && !badgeChanged
        && !effectIdChanged
        && !gazeChanged
        && !performanceChanged
        && !resetEyes
      ) return;

      const now = this._now();
      this.state = motion;
      this.stateAt = now;
      this.motionState = motion;
      this.expressionState = expression;
      this.faceState = face;
      this.gazeState = gaze;
      this.formState = form;
      this.decorationState = decoration;
      this.particleState = particles;
      this.cameraState = camera;
      this.badgeState = badge;
      this.effectId = effect;
      this.sceneDirection = direction;
      this.sceneVariant = variant;

      if (motionChanged || performanceChanged) {
        this.motionAt = now;
        this.ctx = this._freshCtx(now);
        this.ctx.stAt = now + (
          motion === "excited" ? rand(400, 1100)
          : motion === "searching" ? rand(800, 1600)
          : motion === "working" ? rand(1200, 2400)
          : rand(6000, 10000)
        );
        if (motion === "drowsy") this.ctx.nodUntil = now + rand(12_000, 24_000);
        this.celebrateAt = motion === "celebrate" ? now + 140 : -1;
        this.trick = null;
        this.spinTurn = null;
        this.hopAt = -1;
        this.wildWide = false;
      }

      if (faceChanged) this.faceAt = now;

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

      // 旧渲染器让所有特效共享进入时钟；新特效非空时同步重置，保留过渡中的逐帧结果。
      if (effectIdChanged && effect !== null) {
        this.formAt = now;
        this.decorationAt = now;
        this.particleAt = now;
      } else {
        if (formChanged && form !== null) this.formAt = now;
        if (decorationChanged && decoration !== null) this.decorationAt = now;
        if (particleChanged && particles !== null) this.particleAt = now;
      }
      if (decorationChanged && decoration !== null && decoration !== "pencil") this.fx?.resetInk();
      if (gazeChanged) {
        if (gaze === "front" || gaze === "sleeping") {
          this.gazeX.t = 0;
          this.gazeY.t = 0;
          this.gazeUntil = now + rand(5000, 8000);
        } else {
          this.gazeUntil = now + rand(500, 1400);
        }
      }

      try {
        this.onChange(this.snapshot());
      } catch (_) { /* host UI may not be ready */ }
    }

    snapshot() {
      return {
        state: this.state,
        motion: this.motionState,
        expression: this.expressionState,
        face: this.faceState,
        effect: this.effectId,
        gaze: this.gazeState,
        form: this.formState,
        decoration: this.decorationState,
        particles: this.particleState,
        badge: this.badgeState,
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
      };
    }

    winkOnce(eye = Math.random() < 0.5 ? 0 : 1) {
      this.blinkQueue.length = 0;
      this.blink.x = 1;
      this.blink.v = 0;
      this.blink.t = 1;
      this.winkAt = this._now();
      this.winkEye = eye === 0 ? 0 : 1;
    }

    spinOnce(turns = 1, direction = sign()) {
      this._pn(turns, direction);
    }
    bounceOnce() {
      this._hop(this._now());
    }
    pounceOnce(direction = 0, strength = 1) {
      if (this.reduceMotion || this.paused) return;
      this.tx.v += direction * 95 * strength;
      this.ty.v -= 115 * strength;
      this.squash.v += 2.5 * strength;
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
      this.spinTurn = ACTIONS.startSpin(turns, dir);
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
      } else if (this.trickCycle === 2) this.trick = ACTIONS.startTrick("spinBounce", this.reduceMotion);
      else if (this.trickCycle === 3) this.trick = ACTIONS.startTrick("spinDizzy", this.reduceMotion);
      else {
        this._pn(1);
        this.particles.burst(16, 0.95, 0.3);
      }
    }

    _stepVisualChannels(now) {
      const want = this.formState;
      if (want !== this.formTarget) {
        this.formTarget = want;
        this.fx.overlayAt = now;
        this.formRest = false;
        this.formRestAt = 0;
      }
      let on = want != null;
      if (want && FX.CYCLE.has(want)) {
        if (!this.formRest && now - this.fx.overlayAt > (FX.CYCLE_ON[want] || 2500)) {
          this.formRest = true;
          this.formRestAt = now;
        } else if (this.formRest && now - this.formRestAt > FX.CYCLE_OFF) {
          this.formRest = false;
          this.fx.overlayAt = now;
        }
        on = !this.formRest;
      }
      this.formBlend.t = on ? 1 : 0;
      if (on !== this.formVisible) {
        if (!this.reduceMotion) {
          if (on) this.formTurnDirection = sign();
          this.formTurnAccumulator += Math.PI * this.formTurnDirection;
          this.formTurn.t = this.formTurnAccumulator;
        }
        this.formVisible = on;
      }
      if (want && want !== this.formKind) {
        if (this.formKind && this.formBlend.x > 0.02) {
          this.formPrev = this.formKind;
          this.formMix.x = 0;
          this.formMix.v = 0;
          this.formMix.t = 1;
        } else {
          this.formPrev = null;
          this.formMix.x = 1;
          this.formMix.v = 0;
          this.formMix.t = 1;
        }
        this.formKind = want;
        this.fx.overlayAt = now;
        if (want !== "pencil") this.fx.resetInk();
      }
      if (!want && this.formBlend.x < 0.004) {
        if (this.formKind === "pencil" || this.formPrev === "pencil") this.fx.resetInk();
        this.formKind = null;
        this.formPrev = null;
      }

      const decoration = this.decorationState === "hum-dots" ? null : this.decorationState;
      const decorationOn = decoration !== null && (decoration !== "gather" || on);
      this.decorationBlend.t = decorationOn ? 1 : 0;
      if (decoration && decoration !== this.decoKind) {
        if (this.decoKind && this.decorationBlend.x > 0.02) {
          this.decoPrev = this.decoKind;
          this.decorationMix.x = 0;
          this.decorationMix.v = 0;
        } else {
          this.decoPrev = null;
          this.decorationMix.x = 1;
          this.decorationMix.v = 0;
        }
        this.decorationMix.t = 1;
        this.decoKind = decoration;
      }
      if (!decoration && this.decorationBlend.x < 0.004) {
        this.decoKind = null;
        this.decoPrev = null;
      }

      const camera = this.cameraState;
      this.cameraBlend.t = camera && (camera !== "gather" || on) ? 1 : 0;
      if (camera && camera !== this.cameraKind) {
        if (this.cameraKind && this.cameraBlend.x > 0.02) {
          this.cameraPrev = this.cameraKind;
          this.cameraMix.x = 0;
          this.cameraMix.v = 0;
        } else {
          this.cameraPrev = null;
          this.cameraMix.x = 1;
          this.cameraMix.v = 0;
        }
        this.cameraMix.t = 1;
        this.cameraKind = camera;
      }
      if (!camera && this.cameraBlend.x < 0.004) {
        this.cameraKind = null;
        this.cameraPrev = null;
      }
      if (this.formMix.x > 0.996) this.formPrev = null;
      if (this.decorationMix.x > 0.996) this.decoPrev = null;
      if (this.cameraMix.x > 0.996) this.cameraPrev = null;
    }

    _updatePointer(now) {
      const lockFront = this.gazeState === "front" || this.gazeState === "sleeping";
      const src = lockFront ? null : (this.gazeTarget || (this.followPointer ? this.pointerRaw : null));
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
      const dtState = (now - this.motionAt) / 1000;
      const dtFace = (now - this.faceAt) / 1000;
      const dtParticle = (now - this.particleAt) / 1000;
      const controllerOptions = {
        eyeTo: this.eyeTo,
        eyeMorphX: this.eyeMorph.x,
        blinkX: this.blink.x,
        allowAmbientSpin: this.formState !== "pencil",
        direction: this.sceneDirection,
        variant: this.sceneVariant,
        reduceMotion: this.reduceMotion,
      };
      const motion = MOTION.sample(this.motionState, mt, dtState, now, this.ctx, controllerOptions);
      const expression = EXPRESSION.sample(this.faceState, mt, dtFace, now, this.ctx, controllerOptions);
      this.spin.t = motion.rollDeg;
      this.tx.t = motion.xPx;
      this.ty.t = motion.yPx;
      this.squash.t = motion.squashY;
      this.eyeScale.t = expression.eyeScale;
      this.faceRoll = expression.faceRollDeg;
      this.eyeLids = expression.eyeLids;
      if (motion.impulse.yVelocity) this.ty.v += motion.impulse.yVelocity;
      if (motion.impulse.rollVelocity) this.spin.v += motion.impulse.rollVelocity;
      if (expression.eyeTarget) this._morphEyes(expression.eyeTarget[0], expression.eyeTarget[1]);
      if (expression.requestBlink) EY.queueBlink(this.blinkQueue, now);
      if (motion.impulse.spin) this._pn(...motion.impulse.spin);
      for (const event of CHOREOGRAPHY.sample(this.motionState, dtState, this.ctx)) {
        if (event.channel === "particles" && event.type === "burst") {
          this.particles.burst(event.count, event.strength);
        }
      }

      this._stepVisualChannels(now);

      if (this.celebrateAt > 0 && now >= this.celebrateAt && !this.trick && !this.spinTurn) {
        this.trick = ACTIONS.startTrick("spinWild", this.reduceMotion);
        this.celebrateAt = now + 6200;
      }

      const tf = ACTIONS.sampleTrick(this.trick, now);
      if (tf.requestHop) this._hop(now);
      if (tf.done) this.trick = null;
      let hop = ACTIONS.sampleHop(this.hopAt, now);
      if (hop == null) {
        this.hopAt = -1;
        hop = 0;
      }
      let turnRadians = tf.turnRadians;
      if (this.spinTurn) {
        turnRadians = (turnRadians ?? 0) + this.spinTurn.x;
        if (ACTIONS.spinSettled(this.spinTurn)) this.spinTurn = null;
      }
      this.extras = { ...tf, turnRadians, hopYPx: hop };

      if (this.extras.eyeScale != null) this.eyeScale.t = this.extras.eyeScale;

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
      this.blink.t = blinkKey ?? (this.blinkQueue.length ? this.blink.t : (this.extras.lidOverride ?? expression.restLid));

      if (now >= this.gazeUntil) {
        const gz = nextGaze(this.gazeState, this.sceneDirection);
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

      const humming = this.particleState === "wide-spin-belts";
      const loading = this.particleState === "spin-belts";
      if ((humming || loading) && !this.reduceMotion) {
        const Zt = dtParticle;
        const dn = loading ? 3 : 1.6;
        const on = Zt < 0.5 ? 7 * K2(Zt / 0.5) : Zt < 1.3 ? 7 + (dn - 7) * K2((Zt - 0.5) / 0.8) : dn + 0.3 * Math.sin(Zt * 0.5);
        this.effectSpinRadians += on * dt;
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
        stepSpring(this.formBlend, ...SPRINGS.visual, step);
        stepSpring(this.formMix, ...SPRINGS.visualMix, step);
        stepSpring(this.decorationBlend, ...SPRINGS.visual, step);
        stepSpring(this.decorationMix, ...SPRINGS.visualMix, step);
        stepSpring(this.cameraBlend, ...SPRINGS.visual, step);
        stepSpring(this.cameraMix, ...SPRINGS.visualMix, step);
        stepSpring(this.shapeSpring, ...SPRINGS.shape, step);
        stepSpring(this.formTurn, ...SPRINGS.formTurn, step);
      }
      if (this.reduceMotion) {
        this.formMix.x = 1;
        this.decorationMix.x = 1;
        this.cameraMix.x = 1;
        this.formTurn.x = this.formTurn.t;
        this.formBlend.x = this.formBlend.t;
        this.decorationBlend.x = this.decorationBlend.t;
        this.cameraBlend.x = this.cameraBlend.t;
      }
      this.notify.t = this.badgeState === "notification" ? 1 : 0;
      this.humDots.t = this.decorationState === "hum-dots" ? 1 : 0;

      let spinAngle = 0;
      if (this.spinTurn) spinAngle = this.spinTurn.x;
      else if (this.extras.turnRadians != null) spinAngle = this.extras.turnRadians;
      else if (humming || loading) spinAngle = this.effectSpinRadians;
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
      RENDER.paint(this, now);
      this._raf = this.paused ? null : requestAnimationFrame((t) => this._tick(t));
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
    effects: g.GROK_PRESETS.EFFECTS,
  };
})(window);
