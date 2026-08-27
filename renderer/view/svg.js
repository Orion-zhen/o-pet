// @ts-check
/* SVG 帧渲染器。把已混合的控制器状态投影为身体、眼睛、装饰和相机。 */
/**
 * @typedef {ReturnType<typeof import("./effects.js").create>} EffectsRuntime
 * @typedef {InstanceType<EffectsRuntime["OverlayLayer"]>} OverlayLayer
 * @typedef {ReturnType<typeof import("./particles.js").create>} ParticleController
 * @typedef {{ svg: SVGSVGElement, initialShape: string, frame: Readonly<import("../types.js").FrameModel> | null, clipPath: SVGPathElement, defs: SVGDefsElement, document: Document, paintId: string, blurId: string, paintServer: SVGGradientElement | null, blurFilter: SVGFilterElement | null, bodyGlow: SVGPathElement | null, group: SVGGElement, body: SVGPathElement, eyesG: SVGGElement, eyeEls: SVGPathElement[], badge: SVGCircleElement, fx: OverlayLayer, particles: ParticleController }} SvgView
 * @typedef {{ document: Document, initialShape: string, rand: (minimum: number, maximum: number) => number, random: () => number, svg: SVGSVGElement }} SvgRendererOptions
 * @param {{ math: import("../types.js").MathPort, geometry: ReturnType<typeof import("./geometry.js").create>, effects: EffectsRuntime, particles: typeof import("./particles.js"), eyes: ReturnType<typeof import("./eyes.js").create>, data: import("../types.js").GeometryData, tables: { cameraZoomFor(kind: string | null, scale: number): number, VIEW_HALF: number, VIEW_MID: number } }} dependencies
 * @param {SvgRendererOptions} options
 * @returns {import("../types.js").RendererPort}
 */
function create(dependencies, options) {
  const { clamp, K2, Dke, relRot } = dependencies.math;
  const GEO = dependencies.geometry;
  const FX = dependencies.effects;
  const PARTICLES = dependencies.particles;
  const EY = dependencies.eyes;
  const DATA = dependencies.data;
  const { cameraZoomFor, VIEW_HALF, VIEW_MID } = dependencies.tables;
  const { lerpFace } = GEO;

  /** @param {string} name */
  const shapeFor = (name) => {
    const shape = DATA.shapes[name];
    if (!shape) throw new Error(`缺少身形几何数据: ${name}`);
    return shape;
  };

  /** @param {SvgView} character @param {Document} doc @param {() => number} random @param {(minimum: number, maximum: number) => number} rand */
  function build(character, doc, random, rand) {
    const geo = DATA;
    const vb = geo.viewBox;
    character.svg.setAttribute(
      "viewBox",
      `${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`,
    );
    character.svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    character.svg.style.overflow = "visible";
    character.svg.innerHTML = "";
    const ns = "http://www.w3.org/2000/svg";
    const defs = doc.createElementNS(ns, "defs");
    const clip = doc.createElementNS(ns, "clipPath");
    const clipId = `grok-clip-${random().toString(36).slice(2, 8)}`;
    clip.setAttribute("id", clipId);
    character.clipPath = doc.createElementNS(ns, "path");
    clip.appendChild(character.clipPath);
    defs.appendChild(clip);
    character.svg.appendChild(defs);
    character.defs = defs;
    character.document = doc;
    character.paintId = `body-paint-${clipId}`;
    character.blurId = `body-blur-${clipId}`;
    character.paintServer = null;
    character.blurFilter = null;
    character.bodyGlow = null;

    character.group = doc.createElementNS(ns, "g");
    character.body = doc.createElementNS(ns, "path");
    character.body.setAttribute("fill", "var(--fg, #000)");
    const eyesG = doc.createElementNS(ns, "g");
    eyesG.setAttribute("clip-path", `url(#${clipId})`);
    character.eyesG = eyesG;
    character.eyeEls = [0, 1].map(() => {
      const p = doc.createElementNS(ns, "path");
      p.setAttribute("fill", "var(--bg, #f3efe6)");
      eyesG.appendChild(p);
      return p;
    });
    character.badge = doc.createElementNS(ns, "circle");
    character.badge.setAttribute("style", "display:none");
    character.group.appendChild(character.body);
    character.group.appendChild(eyesG);
    character.group.appendChild(character.badge);

    character.fx = new FX.OverlayLayer({ document: doc, random, rand });
    const R = geo.Re;
    character.fx.circlePath = GEO.circlePathOf(R);
    character.fx.pencilPath = GEO.capsule(30, 88, R);
    character.fx.bangPath = GEO.taper(30, 17, 96, R);
    character.fx.attach(character.svg, character.group);
    character.particles = PARTICLES.create({
      back: character.fx.back,
      clamp,
      data: DATA,
      front: character.fx.front,
      idPrefix: character.fx.uid,
      document: doc,
      random,
      rand,
      getRadius: () => {
        const frame = character.frame;
        const shapeName = frame?.shapeName ?? character.initialShape;
        const sh = shapeFor(shapeName);
        const k = K2(clamp(frame?.shapeSpring.x ?? 1, 0, 1));
        const to = sh.beltRadius ?? GEO.shapeModel(shapeName).beltRadius;
        let radius =
          k < 0.999 && frame?.prevBelt != null
            ? frame.prevBelt + (to - frame.prevBelt) * k
            : to;
        if (frame?.formState === "whirl")
          radius += (52 - radius) * clamp(frame.formBlend.x, 0, 1);
        return radius;
      },
    });
    const initialPath = shapeFor(character.initialShape).path;
    character.body.setAttribute("d", initialPath);
    character.clipPath.setAttribute("d", initialPath);
  }

  /** @param {SvgView} character @param {Readonly<import("../types.js").FrameModel>} frame */
  function paint(character, frame) {
    const now = frame.now;
    const geo = DATA;
    const R = geo.Re;
    const shape = shapeFor(frame.shapeName);
    const morphK = K2(clamp(frame.shapeSpring.x, 0, 1));
    const morphing = morphK < 0.999 && frame.prevFace;
    const face = morphing
      ? lerpFace(frame.prevFace, shape.face, morphK)
      : shape.face;
    const fromTilt =
      frame.prevTilt ?? (geo.shapes[frame.prevShape]?.tiltScale || 1);
    const tilt = morphing
      ? fromTilt + ((shape.tiltScale || 1) - fromTilt) * morphK
      : shape.tiltScale || 1;
    const yl = clamp(frame.formBlend.x, 0, 1);
    const mix = clamp(frame.formMix.x, 0, 1);
    const decorationAmount = clamp(frame.decorationBlend.x, 0, 1);
    const decorationMix = clamp(frame.decorationMix.x, 0, 1);
    const cameraAmount = clamp(frame.cameraBlend.x, 0, 1);
    const cameraMix = clamp(frame.cameraMix.x, 0, 1);
    character.fx._reduce = frame.reduceMotion;
    const ov = character.fx.sampleForm(
      now,
      frame.formAt,
      frame.formKind,
      frame.formPrev,
      yl,
      mix,
    );
    const bodyW = 1 - yl;
    const ex = frame.extras;
    const tx = frame.tx.x * bodyW + ex.xOffsetPx * bodyW + ov.xPx * yl;
    const ty =
      (frame.ty.x + ex.hopYPx) * bodyW +
      ex.yOffsetPx * bodyW -
      ov.dotPulse.lift * ov.dotsAmount +
      ov.yPx * yl;
    const rot =
      (frame.spin.x * bodyW + ex.rollOffsetDeg * bodyW) * tilt +
      (ex.freeRollDeg || 0) * bodyW +
      ov.rollDeg * yl;
    const sx = frame.squashX.x * bodyW + ov.radiusScale * yl;
    const sy = frame.squash.x * bodyW + ov.radiusScale * yl;
    character.group.setAttribute(
      "transform",
      `translate(${(R + tx).toFixed(2)} ${(R + ty).toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-R} ${-R})`,
    );
    character.group.style.opacity = (
      (1 - (1 - ov.dotPulse.tone) * ov.dotsAmount) *
      (1 - ov.opacityFade)
    ).toFixed(3);

    const Jc = clamp(yl / FX.FORM_MORPH_THRESHOLD, 0, 1);
    const pencil =
      frame.formKind === "pencil" || frame.formPrev === "pencil";
    const tear = shapeFor("teardrop").path;
    const spinAmt = ex.turnRadians;
    const spinning = spinAmt != null;
    const restRing = morphing
      ? GEO.lerpRing(
          frame.prevRing,
          GEO.shapeModel(frame.shapeName).ring,
          morphK,
        )
      : GEO.shapeModel(frame.shapeName).ring;
    let liveRing = restRing;
    let turned = false;
    let deformed = false;
    const turnAt =
      !morphing && spinning
        ? GEO.shapeModel(frame.shapeName).turnAt
        : null;
    if (turnAt) {
      liveRing = turnAt(spinAmt);
      turned = true;
    }
    const thoughtBumps = character.fx.thoughtBumps(
      now,
      frame.decorationAt,
      frame.decoKind,
      frame.decoPrev,
      decorationAmount,
      decorationMix,
      R,
      frame.reduceMotion,
    );
    const deformation = frame.bodyDeformation
      ? {
          ...frame.bodyDeformation,
          bumps: [...frame.bodyDeformation.bumps, ...thoughtBumps],
        }
      : thoughtBumps.length > 0
        ? { waveAmount: 0, wavePhase: 0, bumps: thoughtBumps }
        : null;
    if (deformation) {
      liveRing = GEO.deformRing(liveRing, R, deformation);
      deformed = true;
    }
    let faceTop = shape.top;
    let faceBottom = shape.bottom;
    if (morphing || turned || deformed) {
      faceTop = Infinity;
      faceBottom = -Infinity;
      for (const p of liveRing) {
        if (p[1] < faceTop) faceTop = p[1];
        if (p[1] > faceBottom) faceBottom = p[1];
      }
    }
    let bodyD;
    if (Jc >= 1) {
      bodyD = pencil
        ? GEO.closedSpline(GEO.formRing(frame.formKind, R, tear))
        : character.fx.circlePath;
    } else if (Jc <= 0 && !morphing && !turned && !deformed) {
      bodyD = shape.path;
    } else {
      const to = GEO.formRing(
        frame.formKind || frame.formPrev,
        R,
        tear,
      );
      bodyD = GEO.closedSpline(
        Jc <= 0 ? liveRing : GEO.lerpRing(liveRing, to, K2(Jc)),
      );
    }
    character.body.setAttribute("d", bodyD);
    if (character.bodyGlow) character.bodyGlow.setAttribute("d", bodyD);
    character.clipPath.setAttribute("d", bodyD);

    character.fx.paint(
      now,
      frame.decorationAt,
      frame.decoKind,
      frame.decoPrev,
      decorationAmount,
      decorationMix,
      R,
      frame.reduceMotion,
    );

    const shrink = 1 - Dke(clamp((frame.pxW - 44) / 90, 0, 1));
    const pScale = frame.pose.scale;
    const zCur = cameraZoomFor(frame.cameraKind, pScale);
    const zPrev = cameraZoomFor(frame.cameraPrev, pScale);
    const zoom =
      1 +
      (zCur * cameraMix + zPrev * (1 - cameraMix) - 1) *
        cameraAmount *
        shrink;
    const half = VIEW_HALF / zoom;
    character.svg.setAttribute(
      "viewBox",
      `${(VIEW_MID - half).toFixed(2)} ${(VIEW_MID - half).toFixed(2)} ${(half * 2).toFixed(2)} ${(half * 2).toFixed(2)}`,
    );

    const morphT = clamp(frame.eyeMorph.x, 0, 1);
    const polys = frame.eyePolys;
    const cr = relRot(frame.pose, frame.poseHome);
    const overlayLive =
      yl > 0.001 ||
      Math.abs(frame.formTurn.t - frame.formTurn.x) > 0.01;
    let cyl = overlayLive ? frame.formTurn.x : null;
    if (ex.turnRadians != null) cyl = (cyl ?? 0) + ex.turnRadians;
    const ringHint = morphing || turned || deformed ? liveRing : null;
    const steadyGaze =
      frame.gazeState === "sleeping" ||
      (frame.gazeState === "front" && frame.frontBlend.t === 0);
    const hasPtr =
      !steadyGaze &&
      !!(
        frame.gazeTarget || frame.pointerRaw
      );
    character.eyesG.setAttribute(
      "transform",
      Math.abs(frame.faceRoll) > 0.01
        ? `rotate(${frame.faceRoll.toFixed(2)} ${R} ${R})`
        : "",
    );
    EY.paintEyes({
      now,
      polys,
      morphT,
      shape,
      face,
      faceTune: frame.faceTune,
      eyeScaleProp: frame.eyeScaleProp,
      blinkX: frame.blink.x,
      eyeBoostX: frame.eyeScale.x,
      gazeX: frame.gazeX.x,
      gazeY: frame.gazeY.x,
      winkAt: frame.winkAt,
      winkEye: frame.winkEye,
      turn: cyl,
      cr,
      pointer: hasPtr ? frame.pointer : null,
      notifyX: frame.notify.x,
      formAmount: frame.formBlend.x,
      eyeEls: character.eyeEls,
      badgeEl: character.badge,
      badgeColor: frame.badgeColor,
      Re: R,
      G9e: geo.G9e,
      extras: ex,
      eyeLids: frame.eyeLids,
      frontBlend: frame.frontBlend.x,
      steadyGaze,
      ringHint,
      badgeRing: restRing,
      top: faceTop,
      bottom: faceBottom,
    });

    const hum = clamp(frame.humDots.x, 0, 1);
    if (hum > 0.01) {
      for (let i = 0; i < 2; i++) {
        const el = character.fx.parts[3 + i];
        const Gn = frame.effectSpinRadians * 0.85 + i * Math.PI;
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

  /** @param {number} value */
  function percent(value) {
    return `${(value * 100).toFixed(3).replace(/\.?0+$/, "")}%`;
  }

  /** @param {SvgView} view */
  function clearBodyPaint(view) {
    view.paintServer?.remove();
    view.blurFilter?.remove();
    view.bodyGlow?.remove();
    view.paintServer = null;
    view.blurFilter = null;
    view.bodyGlow = null;
    view.body.setAttribute("fill", "var(--fg, #000)");
  }

  /** @param {SvgView} view @param {SVGGradientElement} gradient @param {readonly import("../types.js").PaintStop[]} stops */
  function appendStops(view, gradient, stops) {
    for (const stop of stops) {
      const element = view.document.createElementNS(
        "http://www.w3.org/2000/svg",
        "stop",
      );
      element.setAttribute("offset", percent(stop.offset));
      element.setAttribute("stop-color", stop.color);
      element.setAttribute("stop-opacity", String(stop.opacity));
      gradient.appendChild(element);
    }
  }

  /** @param {SvgView} view @param {import("../types.js").BodyPaint} paint */
  function setBodyPaint(view, paint) {
    clearBodyPaint(view);
    if (paint.kind === "solid") {
      view.body.setAttribute("fill", paint.color);
      return;
    }

    const ns = "http://www.w3.org/2000/svg";
    const gradient = view.document.createElementNS(
      ns,
      paint.kind === "linear" ? "linearGradient" : "radialGradient",
    );
    gradient.setAttribute("id", view.paintId);
    gradient.setAttribute("gradientUnits", "objectBoundingBox");
    gradient.setAttribute("color-interpolation", "sRGB");
    if (paint.kind === "linear") {
      const radians = (paint.angle * Math.PI) / 180;
      const dx = Math.sin(radians);
      const dy = -Math.cos(radians);
      const extent = (Math.abs(dx) + Math.abs(dy)) / 2;
      gradient.setAttribute("x1", percent(0.5 - dx * extent));
      gradient.setAttribute("y1", percent(0.5 - dy * extent));
      gradient.setAttribute("x2", percent(0.5 + dx * extent));
      gradient.setAttribute("y2", percent(0.5 + dy * extent));
    } else if (paint.kind === "radial") {
      const [cx, cy] = paint.center;
      const radius = Math.max(
        Math.hypot(cx, cy),
        Math.hypot(1 - cx, cy),
        Math.hypot(cx, 1 - cy),
        Math.hypot(1 - cx, 1 - cy),
      );
      gradient.setAttribute("cx", percent(cx));
      gradient.setAttribute("cy", percent(cy));
      gradient.setAttribute("r", percent(radius));
    }
    appendStops(view, gradient, paint.stops);
    view.defs.appendChild(gradient);
    view.paintServer = gradient;
    const fill = `url(#${view.paintId})`;
    view.body.setAttribute("fill", fill);

    if (paint.kind !== "radial" || paint.blur <= 0) return;
    const filter = view.document.createElementNS(ns, "filter");
    filter.setAttribute("id", view.blurId);
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("x", "-100");
    filter.setAttribute("y", "-100");
    filter.setAttribute("width", "460");
    filter.setAttribute("height", "460");
    const blur = view.document.createElementNS(ns, "feGaussianBlur");
    blur.setAttribute("stdDeviation", String(paint.blur));
    filter.appendChild(blur);
    view.defs.appendChild(filter);
    view.blurFilter = filter;

    const glow = view.document.createElementNS(ns, "path");
    const bodyPath = view.body.getAttribute("d");
    if (bodyPath === null) throw new Error("身体路径尚未初始化");
    glow.setAttribute("d", bodyPath);
    glow.setAttribute("fill", fill);
    glow.setAttribute("filter", `url(#${view.blurId})`);
    glow.setAttribute("pointer-events", "none");
    view.group.insertBefore(glow, view.body);
    view.bodyGlow = glow;
  }

  /** @param {SvgRendererOptions} options @returns {import("../types.js").RendererPort} */
  function createRenderer(options) {
    const view = /** @type {SvgView} */ ({
      svg: options.svg,
      initialShape: options.initialShape,
      frame: null,
    });
    build(view, options.document, options.random, options.rand);

    return Object.freeze({
      bounds: () => view.svg.getBoundingClientRect(),
      burst: (count, strength, spread) =>
        view.particles.burst(count, strength, spread),
      destroy() {
        view.particles.clear();
        view.svg.innerHTML = "";
      },
      render(frame) {
        view.frame = frame;
        view.fx.overlayAt = frame.formOverlayAt;
        paint(view, frame);
      },
      resetInk: () => view.fx.resetInk(),
      resetPlayback() {
        view.particles.reset(0);
        view.fx.hideAll();
        view.fx.resetInk();
      },
      setBodyPaint: (paint) => setBodyPaint(view, paint),
      setReduceMotion: (value) => view.particles.setReduceMotion(value),
      setStyle(name, value) {
        view.svg.style.setProperty(name, value);
        if (name === "--fg") view.fx.setPrimitiveColor(value);
      },
      setViewportStyle(name, value) {
        if (name === "transform") view.svg.style.transform = value;
        else view.svg.style.transformOrigin = value;
      },
      updateParticles: (now, dt, particleOptions) =>
        view.particles.update(now, dt, particleOptions),
    });
  }

  return createRenderer(options);
}

export { create };
