// @ts-check
/* 帧模型投影。渲染器只接收当前帧快照，不读取运行时可变状态。 */

/** @param {import("../types.js").Spring} spring */
const snapshotSpring = (spring) =>
  Object.freeze({ x: spring.x, t: spring.t, v: spring.v });

/**
 * @param {import("../types.js").FrameModel} source
 * @returns {Readonly<import("../types.js").FrameModel>}
 */
function create(source) {
  const bodyDeformation = source.bodyDeformation
    ? Object.freeze({
        ...source.bodyDeformation,
        bumps: source.bodyDeformation.bumps.map((bump) =>
          Object.freeze({ ...bump }),
        ),
      })
    : null;
  return Object.freeze({
    ...source,
    blink: snapshotSpring(source.blink),
    bodyDeformation,
    cameraBlend: snapshotSpring(source.cameraBlend),
    cameraMix: snapshotSpring(source.cameraMix),
    decorationBlend: snapshotSpring(source.decorationBlend),
    decorationMix: snapshotSpring(source.decorationMix),
    extras: Object.freeze({ ...source.extras }),
    eyeMorph: snapshotSpring(source.eyeMorph),
    eyeScale: snapshotSpring(source.eyeScale),
    faceTune: Object.freeze({ ...source.faceTune }),
    formBlend: snapshotSpring(source.formBlend),
    formMix: snapshotSpring(source.formMix),
    formTurn: snapshotSpring(source.formTurn),
    frontBlend: snapshotSpring(source.frontBlend),
    gazeTarget: source.gazeTarget && Object.freeze({ ...source.gazeTarget }),
    gazeX: snapshotSpring(source.gazeX),
    gazeY: snapshotSpring(source.gazeY),
    humDots: snapshotSpring(source.humDots),
    notify: snapshotSpring(source.notify),
    pointer: Object.freeze({ ...source.pointer }),
    pointerRaw: source.pointerRaw && Object.freeze({ ...source.pointerRaw }),
    pose: Object.freeze({ ...source.pose }),
    poseHome: Object.freeze({ ...source.poseHome }),
    shapeSpring: snapshotSpring(source.shapeSpring),
    spin: snapshotSpring(source.spin),
    squash: snapshotSpring(source.squash),
    squashX: snapshotSpring(source.squashX),
    tx: snapshotSpring(source.tx),
    ty: snapshotSpring(source.ty),
  });
}

export { create };
