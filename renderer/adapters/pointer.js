/* 浏览器指针适配器。只处理 DOM 监听、拖动聚合和原生拖动协议。 */
(function (g) {
  function create(options) {
    const { document: doc, frameClock, postDrag } = options;
    const target = options.target;
    let pointer = null;
    let disposed = false;

    function flush() {
      if (!pointer) return;
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

    function finish(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (pointer.frame !== null)
        frameClock.cancelAnimationFrame(pointer.frame);
      flush();
      const result = { moved: pointer.moved };
      pointer = null;
      doc.body.classList.remove("dragging");
      postDrag({ phase: "end" });
      options.onEnd(result);
    }

    function onDown(event) {
      if (disposed || event.button !== 0 || pointer) return;
      pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dx: 0,
        dy: 0,
        frame: null,
        moved: false,
      };
      doc.body.setPointerCapture(event.pointerId);
      doc.body.classList.add("dragging");
      postDrag({ phase: "start" });
      options.onStart({ x: event.clientX, y: event.clientY });
    }

    function onTrackMove(event) {
      options.onTrack({ x: event.clientX, y: event.clientY });
    }

    function onMove(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if ((event.buttons & 1) === 0) {
        finish(event);
        return;
      }
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.dx += dx;
      pointer.dy += dy;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (dx !== 0 || dy !== 0) pointer.moved = true;
      if (pointer.frame === null)
        pointer.frame = frameClock.requestAnimationFrame(onFrame);
    }

    function onLeave() {
      options.onTrack(null);
    }

    function onEnter() {
      options.onEnter();
    }

    function destroy() {
      if (disposed) return;
      disposed = true;
      if (pointer !== null && pointer.frame !== null)
        frameClock.cancelAnimationFrame(pointer.frame);
      if (pointer !== null) {
        flush();
        postDrag({ phase: "end" });
      }
      pointer = null;
      doc.body.classList.remove("dragging");
      target.removeEventListener("pointermove", onTrackMove);
      doc.documentElement.removeEventListener("pointerleave", onLeave);
      doc.body.removeEventListener("pointerenter", onEnter);
      doc.body.removeEventListener("pointerdown", onDown);
      doc.body.removeEventListener("pointermove", onMove);
      doc.body.removeEventListener("pointerup", finish);
      doc.body.removeEventListener("pointercancel", finish);
      doc.body.removeEventListener("lostpointercapture", finish);
    }

    target.addEventListener("pointermove", onTrackMove, { passive: true });
    doc.documentElement.addEventListener("pointerleave", onLeave);
    doc.body.addEventListener("pointerenter", onEnter);
    doc.body.addEventListener("pointerdown", onDown);
    doc.body.addEventListener("pointermove", onMove);
    doc.body.addEventListener("pointerup", finish);
    doc.body.addEventListener("pointercancel", finish);
    doc.body.addEventListener("lostpointercapture", finish);

    return Object.freeze({ destroy, isActive: () => pointer !== null });
  }

  g.O_PET_POINTER = Object.freeze({ create });
})(globalThis[Symbol.for("o-pet.renderer")]);
