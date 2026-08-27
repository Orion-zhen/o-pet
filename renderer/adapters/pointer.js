// @ts-check
/* 浏览器指针适配器。只处理 DOM 监听、手势判定、拖动聚合和原生拖动协议。 */
const HOLD_MS = 420;
const DRAG_DISTANCE_PX = 6;

/**
 * @typedef {"pending" | "petting" | "dragging"} PointerKind
 * @typedef {{ id: number, originX: number, originY: number, x: number, y: number, dx: number, dy: number, frame: unknown | null, holdTimer: number | null, kind: PointerKind }} PointerSession
 * @param {{ document: Document, frameClock: import("../types.js").FrameClock, scheduler: Pick<import("../types.js").Scheduler, "clearTimeout" | "setTimeout">, postDrag: (message: import("../types.js").DragMessage) => void, target: Window, onCancel: () => void, onClassify: (kind: "petting" | "dragging") => void, onEnd: (kind: "tap" | "petting" | "dragging") => void, onEnter: () => void, onStart: (point: import("../types.js").PointerPoint) => void, onTrack: (point: import("../types.js").PointerPoint | null) => void }} options
 */
function create(options) {
  const { document: doc, frameClock, postDrag, scheduler } = options;
  const target = options.target;
  /** @type {PointerSession | null} */
  let pointer = null;
  let disposed = false;

  function clearHoldTimer() {
    if (pointer?.holdTimer === null || pointer?.holdTimer === undefined) return;
    scheduler.clearTimeout(pointer.holdTimer);
    pointer.holdTimer = null;
  }

  function flush() {
    if (!pointer || pointer.kind !== "dragging") return;
    const dx = pointer.dx;
    const dy = pointer.dy;
    pointer.dx = 0;
    pointer.dy = 0;
    if (dx !== 0 || dy !== 0) postDrag({ phase: "move", dx, dy });
  }

  function onFrame() {
    if (!pointer) return;
    pointer.frame = null;
    flush();
  }

  function clearPointer() {
    clearHoldTimer();
    if (pointer?.frame !== null && pointer?.frame !== undefined)
      frameClock.cancelAnimationFrame(pointer.frame);
    pointer = null;
    doc.body.classList.remove("dragging");
    doc.body.classList.remove("petting");
  }

  /** @param {PointerEvent} event */
  function finish(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const kind = pointer.kind === "pending" ? "tap" : pointer.kind;
    if (pointer.kind === "dragging") {
      flush();
      postDrag({ phase: "end" });
    }
    clearPointer();
    options.onEnd(kind);
  }

  /** @param {PointerEvent} event */
  function cancel(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (pointer.kind === "dragging") {
      flush();
      postDrag({ phase: "end" });
    }
    clearPointer();
    options.onCancel();
  }

  function beginPetting() {
    if (!pointer || pointer.kind !== "pending") return;
    pointer.kind = "petting";
    pointer.holdTimer = null;
    pointer.dx = 0;
    pointer.dy = 0;
    doc.body.classList.add("petting");
    options.onClassify("petting");
  }

  function beginDragging() {
    if (!pointer || pointer.kind !== "pending") return;
    clearHoldTimer();
    pointer.kind = "dragging";
    doc.body.classList.add("dragging");
    postDrag({ phase: "start" });
    options.onClassify("dragging");
    pointer.frame = frameClock.requestAnimationFrame(onFrame);
  }

  /** @param {PointerEvent} event */
  function onDown(event) {
    if (disposed || event.button !== 0 || pointer) return;
    pointer = {
      id: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      dy: 0,
      frame: null,
      holdTimer: null,
      kind: "pending",
    };
    doc.body.setPointerCapture(event.pointerId);
    options.onTrack({ x: event.clientX, y: event.clientY });
    options.onStart({ x: event.clientX, y: event.clientY });
    pointer.holdTimer = scheduler.setTimeout(beginPetting, HOLD_MS);
  }

  /** @param {PointerEvent} event */
  function onTrackMove(event) {
    options.onTrack({ x: event.clientX, y: event.clientY });
  }

  /** @param {PointerEvent} event */
  function onMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if ((event.buttons & 1) === 0) {
      finish(event);
      return;
    }
    options.onTrack({ x: event.clientX, y: event.clientY });
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointer.kind === "pending") {
      pointer.dx += dx;
      pointer.dy += dy;
      const totalX = event.clientX - pointer.originX;
      const totalY = event.clientY - pointer.originY;
      if (Math.hypot(totalX, totalY) >= DRAG_DISTANCE_PX) beginDragging();
      return;
    }
    if (pointer.kind !== "dragging") return;
    pointer.dx += dx;
    pointer.dy += dy;
    if (pointer.frame === null)
      pointer.frame = frameClock.requestAnimationFrame(onFrame);
  }

  function onLeave() {
    options.onTrack(null);
  }

  function onEnter() {
    options.onEnter();
  }

  function finishNativeDrag() {
    if (!pointer || pointer.kind !== "dragging") return;
    clearPointer();
    options.onEnd("dragging");
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    if (pointer?.kind === "dragging") {
      flush();
      postDrag({ phase: "end" });
    }
    clearPointer();
    target.removeEventListener("pointermove", onTrackMove);
    doc.documentElement.removeEventListener("pointerleave", onLeave);
    doc.body.removeEventListener("pointerenter", onEnter);
    doc.body.removeEventListener("pointerdown", onDown);
    doc.body.removeEventListener("pointermove", onMove);
    doc.body.removeEventListener("pointerup", finish);
    doc.body.removeEventListener("pointercancel", cancel);
    doc.body.removeEventListener("lostpointercapture", cancel);
  }

  target.addEventListener("pointermove", onTrackMove, { passive: true });
  doc.documentElement.addEventListener("pointerleave", onLeave);
  doc.body.addEventListener("pointerenter", onEnter);
  doc.body.addEventListener("pointerdown", onDown);
  doc.body.addEventListener("pointermove", onMove);
  doc.body.addEventListener("pointerup", finish);
  doc.body.addEventListener("pointercancel", cancel);
  doc.body.addEventListener("lostpointercapture", cancel);

  return Object.freeze({ destroy, finishNativeDrag });
}

export { create };
