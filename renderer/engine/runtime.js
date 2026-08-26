/* 动画运行时。解析控制通道、推进弹簧并向视图提交帧模型。 */
(function (g) {
  function create(dependencies, options) {
    const M = dependencies.math;
    const T = dependencies.tables;
    const MOTION = dependencies.motion;
    const EXPRESSION = dependencies.expression;
    const CHOREOGRAPHY = dependencies.choreography;
    const ACTIONS = dependencies.actions;
    const EY = dependencies.eyes;
    const FX = dependencies.effects;
    const GEO = dependencies.geometry;
    const DATA = dependencies.data;
    const PRESETS = dependencies.presets;
    const GAZE = dependencies.gaze;
    const VISUAL_CHANNELS = dependencies.visualChannels;
    const { spring, stepSpring, springSteps, clamp, K2, mapPointer, Rn } = M;
    const { lerpPoly, lerpFace } = GEO;
    const {
      EYE_PLAYLIST,
      EYE_HOLD_MS,
      BLINK_MS,
      SPRINGS,
      FACE_TUNE,
      POSE,
      POSE_HOME,
      UNIFORM_EYES,
      WINK_STATES,
      poseScale,
      shapeEyeScale,
      inkFg,
      inkCss,
      EYE_BG,
    } = T;

    const resetSpring = (value, target) => {
      value.x = target;
      value.t = target;
      value.v = 0;
    };
    const emptyExtras = () => ({
      turnRadians: null,
      rollOffsetDeg: 0,
      xOffsetPx: 0,
      yOffsetPx: 0,
      freeRollDeg: 0,
      gazeXPx: 0,
      gazeYPx: 0,
      hopYPx: 0,
    });

    class OPetCharacter {
      constructor(opts) {
        this.clock = opts.clock;
        this.destroyed = false;
        this.random = opts.random;
        this.math = opts.math;
        this.rand = this.math.rand;
        this.sign = this.math.sign;
        this.motionController = MOTION.create(this.math);
        this.expressionController = EXPRESSION.create(this.math, T);
        this.gazeController = GAZE.create(this.math);
        this.choreographyController = CHOREOGRAPHY.create(this.math);
        this.actionController = ACTIONS.create(this.math);
        this.eyeController = EY;
        this.shapeName = opts.shape || "blob";
        this.colorId = opts.color || "black";
        this.scheme = opts.scheme || "light";
        this.state = opts.state || "idle";
        this.motionState = null;
        this.expressionState = null;
        this.faceState = null;
        this.gazeState = null;
        this.choreographyState = null;
        this.sceneDirection = 0;
        this.sceneVariant = null;
        this.faceRoll = 0;
        this.eyeLids = null;
        this.loginWrap = opts.loginWrap !== false;
        this.eyeTopology = opts.eyeTopology ?? this.loginWrap;
        this.faceTune = opts.faceTune ?? (this.loginWrap ? FACE_TUNE : null);
        this.pose = {
          ...(this.loginWrap ? POSE : { turn: 0, tilt: 0, roll: 0, scale: 1 }),
          ...opts.pose,
        };
        this.poseHome =
          opts.poseHome ||
          (this.loginWrap ? POSE_HOME : { turn: 0, tilt: 0, roll: 0 });
        this.uniformEyes =
          opts.uniformEyes ?? (this.loginWrap ? UNIFORM_EYES : false);
        this.eyeScaleProp =
          opts.eyeScale ?? (this.loginWrap ? shapeEyeScale(this.shapeName) : 1);
        this.followPointer = !!opts.followPointer;
        this.gazeTarget = opts.gazeTarget || null;
        this.paused = !!opts.paused;
        this.reduceMotion = opts.reduceMotion === true;
        this.badgeColor = opts.badgeColor || "var(--gb-badge, #1d9bf0)";
        this.sizePx = opts.sizePx || null;
        this.eyeColor = opts.eyeColor || null;
        this.bodyPaint = opts.bodyPaint || null;

        this.spin = spring(0);
        this.tx = spring(0);
        this.ty = spring(0);
        this.squash = spring(1);
        this.blink = spring(1);
        this.eyeScale = spring(1);
        this.gazeX = spring(0);
        this.gazeY = spring(0);
        this.eyeMorph = spring(1);
        this.frontBlend = spring(this.state === "front" ? 1 : 0);
        this.shapeSpring = spring(1);

        this.eyeFrom = 0;
        this.eyeTo = 0;
        this.eyeStiffness = 7;
        this.eyeIdx = 0;
        this._fromPolys = null;

        this.t0 = this.clock.now();
        this.motionAt = this.t0;
        this.faceAt = this.t0;
        this.last = this.t0;
        this.eyeUntil = this.t0 + this.rand(...EYE_HOLD_MS.idle);
        this.blinkUntil = this.t0 + this.rand(1500, 7000);
        this.gazeUntil = this.t0 + 800;
        this.blinkQueue = [];
        this.winkAt = -1e9;
        this.winkEye = 0;
        this.winkUntil = this.t0 + this.rand(3000, 8000);
        this.spinTurn = null;
        this.trick = null;
        this.hopAt = -1;
        this.trickCycle = Math.floor(this.rand(0, 5));
        this.wildWide = false;
        this.effectSpinRadians = 0;
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
        this.pxW = 190;
        this.pxAt = 0;
        this.partScale = 1;
        this.celebrateAt = null;
        this.extras = emptyExtras();

        this.renderer = opts.createRenderer();
        this.visual = VISUAL_CHANNELS.create({
          effects: FX,
          math: this.math,
          now: this.t0,
          renderer: this.renderer,
          springs: SPRINGS,
        });
        this.setColor(this.colorId, this.scheme);
        this._applyPoseScale();
        this.setPreset(PRESETS.fromState(this.state), { resetEyes: true });
        this._render(this.t0);
        this._raf = this.paused
          ? null
          : this.clock.requestAnimationFrame((t) => this._tick(t));
      }

      destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this._raf !== null) this.clock.cancelAnimationFrame(this._raf);
        this._raf = null;
        this.renderer.destroy();
      }

      _freshCtx(now) {
        return {
          motion: {
            nodUntil: now + 1800,
            nodEnd: 0,
            idleShiftAt: now + this.rand(7000, 15_000),
            idleShiftEnd: 0,
            idleShiftDuration: 1,
            idleShiftDirection: 1,
            sleepTwitchAt: now + this.rand(18_000, 34_000),
            sleepTwitchEnd: 0,
            angryShakeUntil: 0,
            impulseAt: now + this.rand(500, 1200),
            slumpAt: 0,
            stAt: now + this.rand(6000, 10000),
            dragCycle: -1,
            notifyPop: false,
          },
          expression: {
            wakingBlinked: false,
            stretchBlinked: false,
            quizzicalBlinked: false,
          },
          choreography: {
            happyBounced: false,
            playfulSpun: false,
            proudFlourished: false,
            wakingBurst: false,
          },
        };
      }

      _now() {
        return this.clock.now();
      }

      get particleAt() {
        return this.visual.state.particleAt;
      }

      setPaused(v) {
        if (this.destroyed) return;
        const paused = !!v;
        if (paused === this.paused) return;
        this.paused = paused;
        if (paused) {
          if (this._raf !== null) this.clock.cancelAnimationFrame(this._raf);
          this._raf = null;
        } else {
          this.last = this.clock.now();
          this._raf = this.clock.requestAnimationFrame((t) => this._tick(t));
        }
      }

      setReduceMotion(v) {
        this.reduceMotion = !!v;
        this.renderer.setReduceMotion(this.reduceMotion);
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

      setPointerPosition(pt) {
        this.pointerRaw = this.followPointer ? pt : null;
      }

      setShape(name) {
        if (name === this.shapeName) return;
        if (!DATA.shapes[name]) throw new Error(`未知角色形状: ${name}`);
        const R = DATA.Re;
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
        if (this.bodyPaint) {
          this.renderer.setStyle(
            "--fg",
            this.bodyPaint.kind === "solid"
              ? this.bodyPaint.color
              : this.bodyPaint.accent,
          );
        } else if (this.loginWrap) {
          this.renderer.setStyle("--fg", inkFg(id));
        } else {
          const pal = DATA.palette[id] || DATA.palette.black;
          this.renderer.setStyle(
            "--fg",
            this.scheme === "dark" ? pal.dark : pal.light,
          );
        }
        this.renderer.setBodyPaint(this.bodyPaint);
        this.renderer.setStyle("--ink", inkCss(id));
        this.renderer.setStyle("--bg", this.eyeColor || EYE_BG);
      }

      setInk(paint) {
        this.bodyPaint = paint;
        this.setColor(this.colorId);
      }

      setEyeColor(color) {
        this.eyeColor = color || null;
        this.renderer.setStyle("--bg", this.eyeColor || EYE_BG);
      }

      playPreset(preset) {
        const scene = PRESETS.resolve(preset);
        if (!scene) throw new Error("无效动画预设");
        this._resetPlaybackRuntime();
        this._applyComposition(scene, { resetEyes: true, restart: true });
      }

      setPreset(preset, { resetEyes = false } = {}) {
        const scene = PRESETS.resolve(preset);
        if (!scene) throw new Error("无效动画预设");
        this._applyComposition(scene, { resetEyes });
      }

      _resetPlaybackRuntime() {
        for (const [value, target] of [
          [this.spin, 0],
          [this.tx, 0],
          [this.ty, 0],
          [this.squash, 1],
          [this.blink, 1],
          [this.eyeScale, 1],
          [this.gazeX, 0],
          [this.gazeY, 0],
          [this.eyeMorph, 1],
        ])
          resetSpring(value, target);
        this.faceRoll = 0;
        this.eyeLids = null;
        this.effectSpinRadians = 0;
        this.extras = emptyExtras();
        this.visual.resetPlayback();
      }

      _applyComposition(scene, { resetEyes = false, restart = false } = {}) {
        const motion = scene.motion ?? this.motionState ?? this.state;
        const expression = scene.expression ?? this.expressionState ?? motion;
        const face = scene.face ?? this.faceState ?? motion;
        const gaze = scene.gaze ?? this.gazeState ?? expression;
        const choreography =
          typeof scene.choreography === "string" ? scene.choreography : null;
        const direction =
          scene.direction === -1 || scene.direction === 1 ? scene.direction : 0;
        const variant =
          typeof scene.variant === "string" ? scene.variant : null;
        if (!EYE_PLAYLIST[expression])
          throw new Error(`未知表情通道: ${expression}`);

        const motionChanged = motion !== this.motionState;
        const expressionChanged = expression !== this.expressionState;
        const faceChanged = face !== this.faceState;
        const visualChanged = this.visual.differs(scene);
        const gazeChanged = gaze !== this.gazeState;
        const performanceChanged =
          choreography !== this.choreographyState ||
          direction !== this.sceneDirection ||
          variant !== this.sceneVariant;
        if (
          !motionChanged &&
          !expressionChanged &&
          !faceChanged &&
          !visualChanged &&
          !gazeChanged &&
          !performanceChanged &&
          !resetEyes &&
          !restart
        )
          return;

        const now = this._now();
        this.state = motion;
        this.motionState = motion;
        this.expressionState = expression;
        this.faceState = face;
        this.gazeState = gaze;
        this.choreographyState = choreography;
        this.sceneDirection = direction;
        this.sceneVariant = variant;
        this.frontBlend.t = expression === "front" ? 1 : 0;

        if (motionChanged || performanceChanged || restart) {
          this.motionAt = now;
          this.ctx = this._freshCtx(now);
          this.ctx.motion.stAt =
            now +
            (motion === "excited"
              ? this.rand(400, 1100)
              : motion === "searching"
                ? this.rand(800, 1600)
                : motion === "working"
                  ? this.rand(1200, 2400)
                  : this.rand(6000, 10000));
          if (motion === "drowsy")
            this.ctx.motion.nodUntil = now + this.rand(12_000, 24_000);
          this.celebrateAt = motion === "celebrate" ? now + 140 : null;
          this.trick = null;
          this.spinTurn = null;
          this.hopAt = -1;
          this.wildWide = false;
        }

        if (faceChanged || restart) this.faceAt = now;

        if (expressionChanged || resetEyes || restart) {
          const list = EYE_PLAYLIST[expression];
          this.eyeIdx = 0;
          if (resetEyes || restart) {
            this.blinkQueue.length = 0;
            this.eyeFrom = list[0];
            this.eyeTo = list[0];
            this._fromPolys = null;
            this.eyeMorph.x = 1;
            this.eyeMorph.t = 1;
            this.eyeMorph.v = 0;
          } else if (expression !== "sleeping" && expression !== "waking") {
            this._morphEyes(list[0], expression === "excited" ? 10 : 8);
          }
          this.eyeUntil = now + this.rand(...EYE_HOLD_MS[expression]);
          const blink = BLINK_MS[expression];
          this.blinkUntil = blink ? now + this.rand(1500, 7000) : Infinity;
          this.winkUntil = now + this.rand(3000, 8000);
          if (
            expression !== "waking" &&
            expression !== "sleeping" &&
            expression !== "drowsy" &&
            expression !== "winking"
          ) {
            this.eyeController.queueBlink(this.blinkQueue, now);
          }
        }

        this.visual.apply(scene, now, restart);
        if (gazeChanged || restart) {
          if (gaze === "front" || gaze === "sleeping") {
            this.gazeX.t = 0;
            this.gazeY.t = 0;
            this.gazeUntil = now + this.rand(5000, 8000);
          } else {
            this.gazeUntil = now + this.rand(500, 1400);
          }
        }
      }

      winkOnce(eye = this.random() < 0.5 ? 0 : 1) {
        this.blinkQueue.length = 0;
        this.blink.x = 1;
        this.blink.v = 0;
        this.blink.t = 1;
        this.winkAt = this._now();
        this.winkEye = eye === 0 ? 0 : 1;
      }

      spinOnce(turns = 1, direction = this.sign()) {
        this._pn(turns, direction);
      }
      hopOnce() {
        this._startHop(this._now());
      }
      pounceOnce(direction = 0, strength = 1) {
        if (this.reduceMotion || this.paused) return;
        this.tx.v += direction * 95 * strength;
        this.ty.v -= 115 * strength;
        this.squash.v += 2.5 * strength;
      }
      _applyPoseScale() {
        const sc = this.loginWrap
          ? poseScale(this.shapeName)
          : this.pose.scale || 1;
        this.pose.scale = sc;
        if (this.sizePx) {
          this.renderer.setViewportStyle("width", `${this.sizePx}px`);
          this.renderer.setViewportStyle("height", `${this.sizePx}px`);
        }
        if (Math.abs(sc - 1) > 0.001) {
          this.renderer.setViewportStyle("transform", `scale(${sc})`);
          this.renderer.setViewportStyle("transformOrigin", "50% 50%");
        } else {
          this.renderer.setViewportStyle("transform", "");
        }
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
        const eyes = DATA.eyes;
        const from = this._fromPolys || eyes[this.eyeFrom];
        const to = eyes[this.eyeTo];
        return [lerpPoly(from[0], to[0], t), lerpPoly(from[1], to[1], t)];
      }

      _pn(turns = 1, dir = this.sign()) {
        if (this.reduceMotion || this.paused || this.spinTurn) return;
        this.spinTurn = this.actionController.startSpin(turns, dir);
      }

      _startHop(now) {
        if (this.reduceMotion || this.paused) return;
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
        } else if (this.trickCycle === 2)
          this.trick = this.actionController.startTrick(
            "spinBounce",
            this.reduceMotion,
            this._now(),
          );
        else if (this.trickCycle === 3)
          this.trick = this.actionController.startTrick(
            "spinDizzy",
            this.reduceMotion,
            this._now(),
          );
        else {
          this._pn(1);
          this.renderer.burst(16, 0.95, 0.3);
        }
      }

      _updatePointer(now) {
        const lockFront =
          this.gazeState === "front" || this.gazeState === "sleeping";
        const src = lockFront
          ? null
          : this.gazeTarget || (this.followPointer ? this.pointerRaw : null);
        if (src) {
          if (now - this.rectAt > 200) {
            this.rectCache = this.renderer.bounds();
            this.rectAt = now;
          }
          const rect = this.rectCache;
          if (rect && rect.width > 0) {
            const mapped = this.gazeTarget ? src : mapPointer(rect, src);
            this.pointer.tx =
              clamp(
                (mapped.x - (rect.left + rect.width / 2)) / rect.width,
                -0.6,
                0.6,
              ) * 22;
            this.pointer.ty =
              clamp(
                (mapped.y - (rect.top + rect.height / 2)) / rect.height,
                -0.6,
                0.6,
              ) * 14;
          }
        } else {
          this.pointer.tx = 0;
          this.pointer.ty = 0;
        }
        const z = Rn(0.16);
        this.pointer.x += (this.pointer.tx - this.pointer.x) * z;
        this.pointer.y += (this.pointer.ty - this.pointer.y) * z;
      }

      _render(now) {
        const morphT = clamp(this.eyeMorph.x, 0, 1);
        this.renderer.render({
          ...this.visual.state,
          now,
          badgeColor: this.badgeColor,
          blink: this.blink,
          effectSpinRadians: this.effectSpinRadians,
          extras: this.extras,
          eyeLids: this.eyeLids,
          eyeMorph: this.eyeMorph,
          eyePolys: this._currentPolys(morphT),
          eyeScale: this.eyeScale,
          eyeScaleProp: this.eyeScaleProp,
          eyeTopology: this.eyeTopology,
          faceRoll: this.faceRoll,
          faceTune: this.faceTune,
          followPointer: this.followPointer,
          frontBlend: this.frontBlend,
          gazeState: this.gazeState,
          gazeTarget: this.gazeTarget,
          gazeX: this.gazeX,
          gazeY: this.gazeY,
          pointer: this.pointer,
          pointerRaw: this.pointerRaw,
          pose: this.pose,
          poseHome: this.poseHome,
          prevBelt: this.prevBelt,
          prevFace: this.prevFace,
          prevRing: this.prevRing,
          prevShape: this.prevShape,
          prevTilt: this.prevTilt,
          pxW: this.pxW,
          reduceMotion: this.reduceMotion,
          shapeName: this.shapeName,
          shapeSpring: this.shapeSpring,
          spin: this.spin,
          squash: this.squash,
          tx: this.tx,
          ty: this.ty,
          uniformEyes: this.uniformEyes,
          winkAt: this.winkAt,
          winkEye: this.winkEye,
        });
      }

      _tick(now) {
        const dt = Math.min((now - this.last) / 1000, 0.1);
        this.last = now;

        if (this.paused) {
          this._raf = null;
          return;
        }

        const mt = (now - this.t0) / 1000;
        const dtState = (now - this.motionAt) / 1000;
        const dtFace = (now - this.faceAt) / 1000;
        const dtParticle = (now - this.visual.state.particleAt) / 1000;
        const controllerOptions = {
          eyeTo: this.eyeTo,
          eyeMorphX: this.eyeMorph.x,
          blinkX: this.blink.x,
          allowAmbientSpin: this.visual.state.formState !== "pencil",
          direction: this.sceneDirection,
          variant: this.sceneVariant,
          reduceMotion: this.reduceMotion,
        };
        const motion = this.motionController.sample(
          this.motionState,
          mt,
          dtState,
          now,
          this.ctx.motion,
          controllerOptions,
        );
        const expression = this.expressionController.sample(
          this.faceState,
          mt,
          dtFace,
          now,
          this.ctx.expression,
          { ...controllerOptions, slumpAt: this.ctx.motion.slumpAt },
        );
        this.spin.t = motion.rollDeg;
        this.tx.t = motion.xPx;
        this.ty.t = motion.yPx;
        this.squash.t = motion.squashY;
        this.eyeScale.t = expression.eyeScale;
        this.faceRoll = expression.faceRollDeg;
        this.eyeLids = expression.eyeLids;
        if (motion.impulse.yVelocity) this.ty.v += motion.impulse.yVelocity;
        if (motion.impulse.rollVelocity)
          this.spin.v += motion.impulse.rollVelocity;
        if (expression.eyeTarget)
          this._morphEyes(expression.eyeTarget[0], expression.eyeTarget[1]);
        if (motion.requestBlink || expression.requestBlink)
          this.eyeController.queueBlink(this.blinkQueue, now);
        if (motion.impulse.spin) this._pn(...motion.impulse.spin);
        for (const event of this.choreographyController.sample(
          this.choreographyState,
          dtState,
          this.ctx.choreography,
          { direction: this.sceneDirection },
        )) {
          if (event.channel === "particles" && event.type === "burst") {
            this.renderer.burst(event.count, event.strength);
          } else if (event.channel === "action") {
            if (event.type === "hop") {
              this._startHop(now);
              continue;
            }
            if (event.type === "spin") {
              this._pn(event.turns, event.direction);
              continue;
            }
            const trickKind =
              event.type === "spin-bounce"
                ? "spinBounce"
                : event.type === "spin-dizzy"
                  ? "spinDizzy"
                  : null;
            if (
              trickKind &&
              !this.reduceMotion &&
              !this.spinTurn &&
              !this.trick &&
              this.hopAt < 0
            ) {
              this.trick = this.actionController.startTrick(
                trickKind,
                this.reduceMotion,
                now,
                event.direction,
              );
            }
          }
        }

        this.visual.prepare(now, this.reduceMotion);

        if (
          this.celebrateAt !== null &&
          now >= this.celebrateAt &&
          !this.trick &&
          !this.spinTurn
        ) {
          this.trick = this.actionController.startTrick(
            "spinWild",
            this.reduceMotion,
            now,
          );
          this.celebrateAt = now + 6200;
        }

        const tf = this.actionController.sampleTrick(this.trick, now);
        if (tf.requestHop) this._startHop(now);
        if (tf.done) this.trick = null;
        let hopY = this.actionController.sampleHop(this.hopAt, now);
        if (hopY == null) {
          this.hopAt = -1;
          hopY = 0;
        }
        let turnRadians = tf.turnRadians;
        if (this.spinTurn) {
          turnRadians = (turnRadians ?? 0) + this.spinTurn.x;
          if (this.actionController.spinSettled(this.spinTurn))
            this.spinTurn = null;
        }
        this.extras = { ...tf, turnRadians, hopYPx: hopY };

        if (this.extras.eyeScale != null)
          this.eyeScale.t = this.extras.eyeScale;

        if (
          this.expressionState !== "waking" &&
          this.expressionState !== "sleeping" &&
          now >= this.eyeUntil
        ) {
          const list = EYE_PLAYLIST[this.expressionState];
          this.eyeIdx =
            (this.eyeIdx + 1 + Math.floor(this.rand(0, list.length - 1))) %
            list.length;
          const stiff =
            this.expressionState === "searching" ||
            this.expressionState === "excited"
              ? 10
              : 6;
          this._morphEyes(list[this.eyeIdx], stiff);
          this.eyeUntil = now + this.rand(...EYE_HOLD_MS[this.expressionState]);
        }

        const blinkCadence = BLINK_MS[this.expressionState];
        if (blinkCadence && now >= this.blinkUntil) {
          this.eyeController.queueBlink(this.blinkQueue, now);
          this.blinkUntil = now + this.rand(...blinkCadence);
        }
        const blinkKey = this.eyeController.consumeBlink(this.blinkQueue, now);
        this.blink.t =
          blinkKey ??
          (this.blinkQueue.length
            ? this.blink.t
            : (this.extras.lidOverride ?? expression.restLid));

        if (now >= this.gazeUntil) {
          const gz = this.gazeController.next(
            this.gazeState,
            this.sceneDirection,
          );
          this.gazeX.t = gz.x;
          this.gazeY.t = gz.y;
          this.gazeUntil = now + this.rand(...gz.hold);
        }

        if (WINK_STATES.has(this.expressionState) && now >= this.winkUntil) {
          this.winkAt = now;
          this.winkEye = this.random() < 0.5 ? 0 : 1;
          this.winkUntil = now + this.rand(4500, 10000);
        }

        const humming = this.visual.state.particleState === "wide-spin-belts";
        const loading = this.visual.state.particleState === "spin-belts";
        if ((humming || loading) && !this.reduceMotion) {
          const Zt = dtParticle;
          const dn = loading ? 3 : 1.6;
          const on =
            Zt < 0.5
              ? 7 * K2(Zt / 0.5)
              : Zt < 1.3
                ? 7 + (dn - 7) * K2((Zt - 0.5) / 0.8)
                : dn + 0.3 * Math.sin(Zt * 0.5);
          this.effectSpinRadians += on * dt;
        }

        if (this.reduceMotion) {
          this._morphEyes(EYE_PLAYLIST[this.expressionState][0]);
          resetSpring(this.frontBlend, this.frontBlend.t);
          this.spin.t = 0;
          this.tx.t = 0;
          this.ty.t = 0;
          this.squash.t = 1;
          this.blink.t = 1;
          this.eyeScale.t = 1;
        }

        const nSteps = springSteps(dt);
        const step = dt / nSteps;
        for (let i = 0; i < nSteps; i++) {
          stepSpring(this.eyeMorph, this.eyeStiffness, 1, step);
          stepSpring(this.frontBlend, ...SPRINGS.front, step);
          if (this.spinTurn)
            stepSpring(this.spinTurn, ...SPRINGS.spinTurn, step);
          stepSpring(this.spin, ...SPRINGS.spin, step);
          stepSpring(this.tx, ...SPRINGS.x, step);
          stepSpring(this.ty, ...SPRINGS.y, step);
          stepSpring(this.squash, ...SPRINGS.squash, step);
          stepSpring(this.blink, ...SPRINGS.blink, step);
          stepSpring(this.eyeScale, ...SPRINGS.eyeScale, step);
          stepSpring(this.gazeX, ...SPRINGS.gazeX, step);
          stepSpring(this.gazeY, ...SPRINGS.gazeY, step);
          stepSpring(this.shapeSpring, ...SPRINGS.shape, step);
          this.visual.integrate(step);
        }
        this.visual.finishFrame(this.reduceMotion);

        let spinAngle = 0;
        if (this.spinTurn) spinAngle = this.spinTurn.x;
        else if (this.extras.turnRadians != null)
          spinAngle = this.extras.turnRadians;
        else if (humming || loading) spinAngle = this.effectSpinRadians;
        if (now - this.pxAt > 500) {
          const w = this.renderer.bounds().width;
          if (w > 0) {
            this.pxW = w;
            this.partScale = clamp(Math.pow(340 / w, 0.7), 1, 2.6);
          }
          this.pxAt = now;
        }
        this.renderer.updateParticles(now, dt, {
          spinAngle,
          emitTrails:
            this.spinTurn !== null || this.trick !== null || humming || loading,
          sizeScale: this.partScale,
          wideStyle:
            this.trick?.kind === "spinWild" || this.wildWide || humming,
          sustainBelts: humming || loading,
        });

        this._updatePointer(now);
        this._render(now);
        this._raf =
          this.paused || this.destroyed
            ? null
            : this.clock.requestAnimationFrame((t) => this._tick(t));
      }
    }

    return new OPetCharacter(options);
  }

  g.O_PET_RUNTIME = Object.freeze({ create });
})(globalThis[Symbol.for("o-pet.renderer")]);
