/* 眼睛渲染和眨眼队列。眼形、视线和脸部动态由独立控制器提供。 */
(function (g) {
  function create(dependencies, random) {
    const { clamp, Dke } = dependencies.math;
    const { centroid, polyPath, spanAt, spanPoly } = dependencies.geometry;

    function queueBlink(q, now) {
      q.push(
        { at: now, v: 0.05 },
        { at: now + 70, v: 0.05 },
        { at: now + 150, v: 1.08 },
        { at: now + 300, v: 1 },
      );
      if (random() < 0.14) {
        q.push({ at: now + 370, v: 0.05 }, { at: now + 480, v: 1 });
      }
    }

    function consumeBlink(q, now) {
      let key = null;
      while (q.length && now >= q[0].at) key = q.shift().v;
      return key;
    }

    function winkLid(base, now, winkAt, winkEye, i) {
      let lid = Math.max(base, 0.04);
      if (i === winkEye && now < winkAt + 320) {
        const xr = (now - winkAt) / 320;
        const Fr = xr < 0.42 ? 1 - xr / 0.42 : (xr - 0.42) / 0.58;
        lid = Math.max(lid * clamp(Fr, 0, 1), 0.04);
      }
      return lid;
    }

    function paintEyes(opt) {
      const {
        now,
        polys,
        morphT,
        shape,
        face,
        faceTune,
        eyeScaleProp,
        blinkX,
        gazeX,
        gazeY,
        winkAt,
        winkEye,
        turn,
        cr,
        pointer,
        notifyX,
        formAmount,
        eyeEls,
        badgeEl,
        badgeColor,
        Re,
        G9e,
        extras,
        ringHint,
      } = opt;
      const pulse = 1 + 0.07 * Math.sin(morphT * Math.PI);
      const frontBlend = clamp(opt.frontBlend, 0, 1);
      const freeBlend = 1 - frontBlend;
      const $i = {
        x: face.x,
        y: face.y,
        sx: face.sx * faceTune.gap,
        sy: face.sy * faceTune.height,
        eye: face.eye * faceTune.size,
        leftDX: face.leftDX ?? 0,
      };
      const sX = $i.leftDX * freeBlend;
      const cents = [centroid(polys[0]), centroid(polys[1])];
      let a1 = 0,
        o1 = 0;
      for (const p of polys[0]) a1 = Math.max(a1, Math.abs(p[0] - cents[0][0]));
      for (const p of polys[1]) o1 = Math.max(o1, Math.abs(p[0] - cents[1][0]));
      const l1 = Math.abs(cents[1][0] - (cents[0][0] + sX)) * $i.sx;
      const _ee = a1 + o1 > 0.5 ? clamp(l1 / (a1 + o1), 0.35, 4) : 4;
      const Uee =
        (1 + ($i.eye - 1) * frontBlend) *
        clamp(eyeScaleProp, 0.25, 4);
      const oX = Math.min(clamp(opt.eyeBoostX, 0.2, 2) * Uee, _ee / pulse);
      const Hee = Math.min(
        oX * clamp(faceTune.eyeWidth, 0.2, 3),
        _ee / pulse,
      );
      const u1 = oX * clamp(faceTune.eyeHeight, 0.2, 3);
      const liveSpan = ringHint
        ? (y) => spanPoly(ringHint, y, Re)
        : spanAt(shape.path, Re);
      const top = opt.top;
      const bottom = opt.bottom;
      const Vn = 0;
      const midX = (cents[0][0] + cents[1][0]) / 2;
      const midY = (cents[0][1] + cents[1][1]) / 2;
      const pullX = (Re - midX) * 0.42 * Vn;
      const pullY = (Re - midY) * 0.42 * Vn;
      const gazeW = pointer ? 0.2 : 1;
      const badgeRing = opt.badgeRing;
      const Yl = badgeRing[
        Math.round((badgeRing.length * 7) / 8) % badgeRing.length
      ];
      const faceRotation = [
        cr[0] + (1 - cr[0]) * frontBlend,
        cr[1] * freeBlend,
        cr[2] * freeBlend,
        cr[3] * freeBlend,
        cr[4] + (1 - cr[4]) * frontBlend,
        cr[5] * freeBlend,
        cr[6] * freeBlend,
        cr[7] * freeBlend,
        cr[8] + (1 - cr[8]) * frontBlend,
      ];

      for (let i = 0; i < 2; i++) {
        const poly = polys[i];
        const [Gn, Ti] = cents[i];
        eyeEls[i].setAttribute("d", polyPath(poly));
        const eyeLid = opt.eyeLids?.[i] ?? 1;
        const lid = winkLid(blinkX * eyeLid, now, winkAt, winkEye, i);
        const Ea = Gn + (i === 0 ? sX : 0);
        let Ca = Re + $i.x;
        let Wo = (Ea - Re) * $i.sx;
        let _c = 1,
          vre = 1,
          km = 1,
          Ree = 0,
          Fee = 0,
          zee = 1,
          bre = true,
          Tre = 1;
        let Sre = clamp(Re + $i.y + (Ti - Re) * $i.sy, top + 2, bottom - 2);
        const surfaceTurn = turn == null ? null : turn * freeBlend;
        const use3d = frontBlend < 1;

        if (use3d) {
          const xr = (Ea - Re) / Re;
          const Fr = (Re - Ti) / Re;
          const Ia = Math.sqrt(Math.max(0, 1 - xr * xr - Fr * Fr)) || 0.02;
          const li =
            faceRotation[0] * xr + faceRotation[1] * Fr + faceRotation[2] * Ia;
          const bl =
            faceRotation[3] * xr + faceRotation[4] * Fr + faceRotation[5] * Ia;
          const Io =
            faceRotation[6] * xr + faceRotation[7] * Fr + faceRotation[8] * Ia;
          Wo = li * Re * $i.sx;
          Sre = clamp(Re + $i.y - bl * Re * $i.sy, top + 2, bottom - 2);
          let uo = -Fr * xr,
            Tl = 1 - Fr * Fr,
            Zi = -Fr * Ia;
          const Yo = Math.hypot(uo, Tl, Zi);
          if (Yo < 1e-6) {
            uo = 0;
            Tl = 0;
            Zi = 1;
          } else {
            uo /= Yo;
            Tl /= Yo;
            Zi /= Yo;
          }
          const md = Fr * Zi - Ia * Tl,
            Oc = Ia * uo - xr * Zi,
            yu = xr * Tl - Fr * uo;
          const vm =
            faceRotation[0] * uo +
            faceRotation[1] * Tl +
            faceRotation[2] * Zi;
          const Hme =
            faceRotation[3] * uo +
            faceRotation[4] * Tl +
            faceRotation[5] * Zi;
          const Nre =
            faceRotation[0] * md +
            faceRotation[1] * Oc +
            faceRotation[2] * yu;
          const Ere =
            faceRotation[3] * md +
            faceRotation[4] * Oc +
            faceRotation[5] * yu;
          const Cre = md,
            Ha = -Oc,
            ci = uo,
            Ys = -Tl;
          const ku = Cre * Ys - ci * Ha || 1e-6;
          const Ql = Ys / ku,
            Gee = -ci / ku,
            bm = -Ha / ku,
            Ire = Cre / ku;
          km = Nre * Ql + vm * bm;
          Fee = Nre * Gee + vm * Ire;
          Ree = -Ere * Ql + -Hme * bm;
          zee = -Ere * Gee + -Hme * Ire;
          _c = Math.max(Math.hypot(km, Ree), 0.02);
          vre = Math.max(Math.hypot(Fee, zee), 0.02);
          bre = Io > 0.02;
          Tre = Dke(clamp(Io / 0.5, 0, 1));
        }

        if (surfaceTurn != null) {
          const [spL, spR] = liveSpan(Sre);
          const rad = Math.max((spR - spL) / 2, 12);
          Ca = (spL + spR) / 2;
          const li0 = Math.asin(clamp(Wo / rad, -1, 1));
          const bl0 = li0 + surfaceTurn;
          const Io0 = Math.cos(bl0);
          const uo0 = Math.max(Math.cos(li0), 0.02);
          bre = Io0 > 0.02;
          _c = Math.max(Io0, 0.02) / uo0;
          Wo = rad * Math.sin(bl0);
          Tre = Dke(clamp(Io0 / 0.5, 0, 1));
        }

        Ca += (Re + $i.x - Ca) * frontBlend;
        Wo += ((i === 0 ? -28 : 28) * $i.sx - Wo) * frontBlend;
        Sre += (clamp(Re + $i.y, top + 2, bottom - 2) - Sre) * frontBlend;

        const ambientBlend = opt.steadyGaze ? 0 : freeBlend;
        let Kj =
          (Math.sin(now * 42e-5 + i) * 1.4 +
            Math.sin(now * 0.001 + i * 2) * 0.5) *
          ambientBlend;
        let Ko = Math.sin(now * 58e-5 + i) * 0.9 * ambientBlend;
        if (pointer) {
          Kj += (pointer.x * (1 - 0.6 * Vn) + pullX) * ambientBlend;
          Ko += (pointer.y * (1 - 0.6 * Vn) + pullY) * ambientBlend;
        } else {
          Kj += pullX * ambientBlend;
          Ko += pullY * ambientBlend;
        }
        Kj += gazeX * gazeW + extras.gazeXPx;
        Ko += gazeY * gazeW + extras.gazeYPx;
        const $ee = clamp(notifyX, 0, 1);
        Kj -= 10 * $ee;
        Ko += 7 * $ee;

        const Vee = clamp(_c * Hee * pulse, 0.02, 2.4);
        const _2 = clamp(vre * lid * u1 * pulse, 0.02, 2.4);
        eyeEls[i].style.display = bre && formAmount < 0.5 ? "" : "none";
        const useTurnOr3d = surfaceTurn != null || use3d;
        const Ume = G9e * _2 + 2;
        const vl = clamp(
          useTurnOr3d ? Sre + Ko * $i.sy : Re + $i.y + (Ti + Ko - Re) * $i.sy,
          top + Ume,
          bottom - Ume,
        );
        let O2 = -Infinity,
          Xl = Infinity;
        for (let p = 0; p < poly.length; p += 2) {
          const Frp = (poly[p][0] - Gn) * Vee;
          const [Ia2, li2] = liveSpan(vl + (poly[p][1] - Ti) * _2);
          if (Ia2 - Frp > O2) O2 = Ia2 - Frp;
          if (li2 - Frp < Xl) Xl = li2 - Frp;
        }
        const xre = Ca + Wo + Kj * $i.sx;
        const lX = O2 <= Xl ? clamp(xre, O2, Xl) : (O2 + Xl) / 2;
        let dd = lX + (xre - lX) * (1 - Tre);
        let Yj = vl;
        if (notifyX > 0.01) {
          const xr = 20 * clamp(notifyX, 0, 1.4);
          const Fr = dd - Yl[0],
            Ia = Yj - Yl[1];
          const li = Math.hypot(Fr, Ia) || 1;
          const bl = Fr / li,
            Io = Ia / li;
          const uo = (i === 0 ? a1 : o1) * Vee;
          const Tl = Math.hypot(uo * bl, G9e * _2 * Io);
          const Zi = xr + Tl + 5;
          if (li < Zi) {
            dd += bl * (Zi - li);
            Yj += Io * (Zi - li);
          }
        }

        if (use3d) {
          const FrM = clamp(
            (surfaceTurn != null ? _c : 1) * Hee * pulse,
            0.02,
            2.4,
          );
          const IaM = clamp(lid * u1 * pulse, 0.02, 2.4);
          const liM = km * FrM,
            blM = Ree * FrM,
            IoM = Fee * IaM,
            uoM = zee * IaM;
          eyeEls[i].setAttribute(
            "transform",
            `translate(${dd.toFixed(2)} ${Yj.toFixed(2)}) matrix(${liM.toFixed(4)} ${blM.toFixed(4)} ${IoM.toFixed(4)} ${uoM.toFixed(4)} 0 0) translate(${(-Gn).toFixed(2)} ${(-Ti).toFixed(2)})`,
          );
        } else {
          eyeEls[i].setAttribute(
            "transform",
            `translate(${dd.toFixed(2)} ${Yj.toFixed(2)}) scale(${Vee.toFixed(4)} ${_2.toFixed(4)}) translate(${(-Gn).toFixed(2)} ${(-Ti).toFixed(2)})`,
          );
        }
      }

      const amt = clamp(notifyX, 0, 1.4);
      if (amt <= 0.01) badgeEl.style.display = "none";
      else {
        badgeEl.style.display = "";
        badgeEl.style.fill = badgeColor;
        badgeEl.setAttribute("cx", Yl[0].toFixed(1));
        badgeEl.setAttribute("cy", Yl[1].toFixed(1));
        badgeEl.setAttribute("r", (20 * amt).toFixed(2));
      }
    }

    return Object.freeze({ queueBlink, consumeBlink, paintEyes });
  }

  g.OPET_EYES = Object.freeze({ create });
})(globalThis[Symbol.for("o-pet.renderer")]);
