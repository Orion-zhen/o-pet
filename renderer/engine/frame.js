// @ts-check
/* 帧模型投影. 复用未变化的不可变数据, 后续帧不修改已经提交的快照. */

/** @param {import("../types.js").SpringSnapshot} spring @param {import("../types.js").SpringSnapshot | undefined} previous */
const snapshotSpring = (spring, previous) =>
  previous &&
  Object.is(spring.x, previous.x) &&
  Object.is(spring.t, previous.t) &&
  Object.is(spring.v, previous.v)
    ? previous
    : Object.freeze({ x: spring.x, t: spring.t, v: spring.v });

/** @param {Readonly<import("../types.js").FrameModel>} source @param {Readonly<import("../types.js").FrameModel> | null} previous */
function snapshotPose(source, previous) {
  const pose = source.pose;
  const old = previous?.pose;
  return old &&
    Object.is(pose.turn, old.turn) && Object.is(pose.tilt, old.tilt) &&
    Object.is(pose.roll, old.roll) && Object.is(pose.scale, old.scale)
    ? old
    : Object.freeze({ ...pose });
}

/** @returns {(source: import("../types.js").FrameModel) => Readonly<import("../types.js").FrameModel>} */
function create() {
  /** @type {Readonly<import("../types.js").FrameModel> | null} */
  let previous = null;

  return (source) => {
    const bodyDeformation = source.bodyDeformation
      ? Object.freeze({
          ...source.bodyDeformation,
          bumps: source.bodyDeformation.bumps.map((bump) =>
            Object.freeze({ ...bump }),
          ),
        })
      : null;
    const home = source.poseHome;
    const oldHome = previous?.poseHome;
    const poseHome = oldHome &&
      Object.is(home.turn, oldHome.turn) && Object.is(home.tilt, oldHome.tilt) &&
      Object.is(home.roll, oldHome.roll)
      ? oldHome
      : Object.freeze({ ...home });
    const tune = source.faceTune;
    const oldTune = previous?.faceTune;
    const faceTune = oldTune &&
      Object.is(tune.size, oldTune.size) && Object.is(tune.gap, oldTune.gap) &&
      Object.is(tune.height, oldTune.height) &&
      Object.is(tune.eyeWidth, oldTune.eyeWidth) && Object.is(tune.eyeHeight, oldTune.eyeHeight)
      ? oldTune
      : Object.freeze({ ...tune });
    const frame = Object.freeze({
      ...source,
      blink: snapshotSpring(source.blink, previous?.blink),
      bodyDeformation,
      cameraBlend: snapshotSpring(source.cameraBlend, previous?.cameraBlend),
      cameraMix: snapshotSpring(source.cameraMix, previous?.cameraMix),
      decorationBlend: snapshotSpring(source.decorationBlend, previous?.decorationBlend),
      decorationMix: snapshotSpring(source.decorationMix, previous?.decorationMix),
      extras: Object.freeze({ ...source.extras }),
      eyeMorph: snapshotSpring(source.eyeMorph, previous?.eyeMorph),
      eyeScale: snapshotSpring(source.eyeScale, previous?.eyeScale),
      faceTune,
      formBlend: snapshotSpring(source.formBlend, previous?.formBlend),
      formMix: snapshotSpring(source.formMix, previous?.formMix),
      formTurn: snapshotSpring(source.formTurn, previous?.formTurn),
      frontBlend: snapshotSpring(source.frontBlend, previous?.frontBlend),
      gazeTarget: source.gazeTarget && Object.freeze({ ...source.gazeTarget }),
      gazeX: snapshotSpring(source.gazeX, previous?.gazeX),
      gazeY: snapshotSpring(source.gazeY, previous?.gazeY),
      humDots: snapshotSpring(source.humDots, previous?.humDots),
      notify: snapshotSpring(source.notify, previous?.notify),
      pointer: Object.freeze({ ...source.pointer }),
      pointerRaw: source.pointerRaw && Object.freeze({ ...source.pointerRaw }),
      pose: snapshotPose(source, previous),
      poseHome,
      shapeSpring: snapshotSpring(source.shapeSpring, previous?.shapeSpring),
      spin: snapshotSpring(source.spin, previous?.spin),
      squash: snapshotSpring(source.squash, previous?.squash),
      squashX: snapshotSpring(source.squashX, previous?.squashX),
      tx: snapshotSpring(source.tx, previous?.tx),
      ty: snapshotSpring(source.ty, previous?.ty),
    });
    previous = frame;
    return frame;
  };
}

export { create };
