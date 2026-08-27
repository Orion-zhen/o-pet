/* SVG 帧渲染器。把已混合的控制器状态投影为身体、眼睛、装饰和相机。 */
(function (g) {
  function create(dependencies, options) {
    const { clamp, K2, Dke, relRot } = dependencies.math;
    const GEO = dependencies.geometry;
    const FX = dependencies.effects;
    const PARTICLES = dependencies.particles;
    const EY = dependencies.eyes;
    const DATA = dependencies.data;
    const { cameraZoomFor, VIEW_HALF, VIEW_MID } = dependencies.tables;
    const { lerpFace } = GEO;

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
          const sh = geo.shapes[character.shapeName];
          const k = K2(clamp(character.shapeSpring.x, 0, 1));
          const to =
            sh.beltRadius ?? GEO.shapeModel(character.shapeName).beltRadius;
          let je =
            k < 0.999 && character.prevBelt != null
              ? character.prevBelt + (to - character.prevBelt) * k
              : to;
          if (character.formState === "whirl")
            je += (52 - je) * clamp(character.formBlend.x, 0, 1);
          return je;
        },
      });
      character.body.setAttribute("d", geo.shapes[character.shapeName].path);
      character.clipPath.setAttribute(
        "d",
        geo.shapes[character.shapeName].path,
      );
    }

    function paint(character, now) {
      const geo = DATA;
      const R = geo.Re;
      const shape = geo.shapes[character.shapeName];
      const morphK = K2(clamp(character.shapeSpring.x, 0, 1));
      const morphing = morphK < 0.999 && character.prevFace;
      const face = morphing
        ? lerpFace(character.prevFace, shape.face, morphK)
        : shape.face;
      const fromTilt =
        character.prevTilt ?? (geo.shapes[character.prevShape]?.tiltScale || 1);
      const tilt = morphing
        ? fromTilt + ((shape.tiltScale || 1) - fromTilt) * morphK
        : shape.tiltScale || 1;
      const yl = clamp(character.formBlend.x, 0, 1);
      const mix = clamp(character.formMix.x, 0, 1);
      const decorationAmount = clamp(character.decorationBlend.x, 0, 1);
      const decorationMix = clamp(character.decorationMix.x, 0, 1);
      const cameraAmount = clamp(character.cameraBlend.x, 0, 1);
      const cameraMix = clamp(character.cameraMix.x, 0, 1);
      character.fx._reduce = character.reduceMotion;
      const ov = character.fx.sampleForm(
        now,
        character.formAt,
        character.formKind,
        character.formPrev,
        yl,
        mix,
      );
      const bodyW = 1 - yl;
      const ex = character.extras;
      const tx = character.tx.x * bodyW + ex.xOffsetPx * bodyW + ov.xPx * yl;
      const ty =
        (character.ty.x + ex.hopYPx) * bodyW +
        ex.yOffsetPx * bodyW -
        ov.dotPulse.lift * ov.dotsAmount +
        ov.yPx * yl;
      const rot =
        (character.spin.x * bodyW + ex.rollOffsetDeg * bodyW) * tilt +
        (ex.freeRollDeg || 0) * bodyW +
        ov.rollDeg * yl;
      const sx = character.squashX.x * bodyW + ov.radiusScale * yl;
      const sy = character.squash.x * bodyW + ov.radiusScale * yl;
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
        character.formKind === "pencil" || character.formPrev === "pencil";
      const tear = geo.shapes.teardrop.path;
      const spinAmt = ex.turnRadians;
      const spinning = spinAmt != null;
      const restRing = morphing
        ? GEO.lerpRing(
            character.prevRing,
            GEO.shapeModel(character.shapeName).ring,
            morphK,
          )
        : GEO.shapeModel(character.shapeName).ring;
      let liveRing = restRing;
      let turned = false;
      let deformed = false;
      const turnAt =
        !morphing && spinning
          ? GEO.shapeModel(character.shapeName).turnAt
          : null;
      if (turnAt) {
        liveRing = turnAt(spinAmt);
        turned = true;
      }
      const thoughtBumps = character.fx.thoughtBumps(
        now,
        character.decorationAt,
        character.decoKind,
        character.decoPrev,
        decorationAmount,
        decorationMix,
        R,
        character.reduceMotion,
      );
      const deformation = character.bodyDeformation
        ? {
            ...character.bodyDeformation,
            bumps: [...character.bodyDeformation.bumps, ...thoughtBumps],
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
          ? GEO.closedSpline(GEO.formRing(character.formKind, R, tear))
          : character.fx.circlePath;
      } else if (Jc <= 0 && !morphing && !turned && !deformed) {
        bodyD = shape.path;
      } else {
        const to = GEO.formRing(
          character.formKind || character.formPrev,
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
        character.decorationAt,
        character.decoKind,
        character.decoPrev,
        decorationAmount,
        decorationMix,
        R,
        character.reduceMotion,
      );

      const shrink = 1 - Dke(clamp((character.pxW - 44) / 90, 0, 1));
      const pScale = character.pose.scale;
      const zCur = cameraZoomFor(character.cameraKind, pScale);
      const zPrev = cameraZoomFor(character.cameraPrev, pScale);
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

      const morphT = clamp(character.eyeMorph.x, 0, 1);
      const polys = character.eyePolys;
      const cr = relRot(character.pose, character.poseHome);
      const overlayLive =
        yl > 0.001 ||
        Math.abs(character.formTurn.t - character.formTurn.x) > 0.01;
      let cyl = overlayLive ? character.formTurn.x : null;
      if (ex.turnRadians != null) cyl = (cyl ?? 0) + ex.turnRadians;
      const ringHint = morphing || turned || deformed ? liveRing : null;
      const steadyGaze =
        character.gazeState === "sleeping" ||
        (character.gazeState === "front" && character.frontBlend.t === 0);
      const hasPtr =
        !steadyGaze &&
        !!(
          character.gazeTarget || character.pointerRaw
        );
      character.eyesG.setAttribute(
        "transform",
        Math.abs(character.faceRoll) > 0.01
          ? `rotate(${character.faceRoll.toFixed(2)} ${R} ${R})`
          : "",
      );
      EY.paintEyes({
        now,
        polys,
        morphT,
        shape,
        face,
        faceTune: character.faceTune,
        eyeScaleProp: character.eyeScaleProp,
        blinkX: character.blink.x,
        eyeBoostX: character.eyeScale.x,
        gazeX: character.gazeX.x,
        gazeY: character.gazeY.x,
        winkAt: character.winkAt,
        winkEye: character.winkEye,
        turn: cyl,
        cr,
        pointer: hasPtr ? character.pointer : null,
        notifyX: character.notify.x,
        formAmount: character.formBlend.x,
        eyeEls: character.eyeEls,
        badgeEl: character.badge,
        badgeColor: character.badgeColor,
        Re: R,
        G9e: geo.G9e,
        extras: ex,
        eyeLids: character.eyeLids,
        frontBlend: character.frontBlend.x,
        steadyGaze,
        ringHint,
        badgeRing: restRing,
        top: faceTop,
        bottom: faceBottom,
      });

      const hum = clamp(character.humDots.x, 0, 1);
      if (hum > 0.01) {
        for (let i = 0; i < 2; i++) {
          const el = character.fx.parts[3 + i];
          const Gn = character.effectSpinRadians * 0.85 + i * Math.PI;
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

    function percent(value) {
      return `${(value * 100).toFixed(3).replace(/\.?0+$/, "")}%`;
    }

    function clearBodyPaint(view) {
      view.paintServer?.remove();
      view.blurFilter?.remove();
      view.bodyGlow?.remove();
      view.paintServer = null;
      view.blurFilter = null;
      view.bodyGlow = null;
      view.body.setAttribute("fill", "var(--fg, #000)");
    }

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
      } else {
        throw new Error(`未知身体绘制类型: ${paint.kind}`);
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
      glow.setAttribute("d", bodyPath);
      glow.setAttribute("fill", fill);
      glow.setAttribute("filter", `url(#${view.blurId})`);
      glow.setAttribute("pointer-events", "none");
      view.group.insertBefore(glow, view.body);
      view.bodyGlow = glow;
    }

    function createRenderer(options) {
      const view = {
        svg: options.svg,
        shapeName: options.initialShape,
        shapeSpring: { x: 1 },
        prevBelt: null,
        formState: null,
        formBlend: { x: 0 },
      };
      build(view, options.document, options.random, options.rand);

      return Object.freeze({
        bounds: () => view.svg.getBoundingClientRect(),
        burst: (...args) => view.particles.burst(...args),
        destroy() {
          view.particles.clear();
          view.svg.innerHTML = "";
        },
        render(frame) {
          Object.assign(view, frame);
          view.fx.overlayAt = frame.formOverlayAt;
          paint(view, frame.now);
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
          view.svg.style[name] = value;
        },
        updateParticles: (...args) => view.particles.update(...args),
      });
    }

    return createRenderer(options);
  }

  g.OPET_RENDER = Object.freeze({ create });
})(globalThis[Symbol.for("o-pet.renderer")]);
