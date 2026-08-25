/* o-pet 行为导演。语义活动保持确定性，动作片段根据持续时间、最近动作和冷却选择。 */
(function (g) {
  const ACTIVITIES = Object.freeze({
    idle: true,
    thinking: true,
    searching: true,
    coding: true,
    terminal: true,
    receiving: true,
    consulting: true,
    tooling: true,
    replying: true,
    awaiting_approval: true,
  });
  const CUES = Object.freeze({
    engage: Object.freeze({ priority: 1 }),
    progress: Object.freeze({ priority: 0 }),
    reply_sent: Object.freeze({ priority: 2 }),
    approval_granted: Object.freeze({ priority: 2 }),
    approval_denied: Object.freeze({ priority: 2 }),
    error_first: Object.freeze({ priority: 3 }),
    error_repeated: Object.freeze({ priority: 3 }),
    error_stubborn: Object.freeze({ priority: 3 }),
    completed_quick: Object.freeze({ priority: 4 }),
    completed_normal: Object.freeze({ priority: 4 }),
    completed_hard: Object.freeze({ priority: 4 }),
    run_failed: Object.freeze({ priority: 4 }),
    run_aborted: Object.freeze({ priority: 4 }),
  });
  const STARTUP_MS = 2000;
  const WAKING_MS = 1800;
  const ACTIVITY_SETTLE_MS = 350;
  const PROTECTED_MODES = new Set(["startup", "waking"]);
  const COMPLETION_CUES = new Set([
    "completed_quick", "completed_normal", "completed_hard", "run_failed", "run_aborted",
  ]);
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  const scene = (pose, expression = pose, effect = pose, gaze = expression) =>
    Object.freeze({ pose, expression, effect, gaze });
  const SCENES = Object.freeze({
    spawning: scene("spawning"),
    waking: scene("waking"),
    idle: scene("idle", "idle", null, "idle"),
    sleeping: scene("sleeping"),
    drowsy: scene("drowsy", "drowsy", null, "drowsy"),
    bored: scene("bored", "bored", null, "bored"),
    playful: scene("playful", "playful", null, "playful"),
    bouncing: scene("playful", "happy", "bouncing", "playful"),
    listening: scene("listening", "listening", null, "listening"),
    curious: scene("curious", "curious", null, "curious"),
    thinking: scene("thinking", "thinking", null, "thinking"),
    deepThinking: scene("thinking", "curious", "thinking", "thinking"),
    humming: scene("humming", "thinking", "humming", "thinking"),
    radar: scene("thinking", "searching", "radar", "searching"),
    searching: scene("searching", "searching", null, "searching"),
    coding: scene("working", "working", "writing", "working"),
    reviewing: scene("thinking", "searching", null, "working"),
    terminalTyping: scene("working", "working", null, "working"),
    loading: scene("working", "working", "loading", "working"),
    receiving: scene("working", "curious", "receiving", "searching"),
    consulting: scene("thinking", "curious", "orbit", "thinking"),
    tooling: scene("working", "working", "orbit", "working"),
    replying: scene("listening", "listening", "dictating", "listening"),
    sending: scene("working", "happy", "sending", "notifying"),
    alerting: scene("alerting"),
    notifying: scene("notifying"),
    happy: scene("happy", "happy", null, "happy"),
    quickHappy: scene("happy", "winking", null, "happy"),
    shy: scene("shy", "shy", null, "shy"),
    surprised: scene("surprised", "surprised", null, "surprised"),
    confused: scene("confused", "confused", null, "confused"),
    angry: scene("angry", "angry", null, "angry"),
    proud: scene("proud", "proud", null, "proud"),
    celebrate: scene("celebrate"),
    sad: scene("sad", "sad", null, "sad"),
  });

  function create(options) {
    const doc = options.document || document;
    const clock = options.clock || g;
    const frameClock = options.frameClock || g;
    const now = options.now || (() => performance.now());
    const random = options.random || Math.random;
    const motionQuery = options.motionQuery || g.matchMedia("(prefers-reduced-motion: reduce)");
    const character = new g.GrokCharacter(options.svg, {
      color: "black",
      followPointer: true,
      mode: "hold",
      shape: "blob",
      state: "spawning",
    });
    let activity = "idle";
    let activityAt = now();
    let currentCue = null;
    let currentScene = SCENES.spawning;
    let destroyed = false;
    let lastProgressAt = -Infinity;
    let mode = "startup";
    let pendingCue = null;
    let pointer = null;
    let reduceMotionPreference = false;
    let transition = null;
    const lastAccent = new Map();

    function clearTransition() {
      if (!transition) return;
      if (transition.handle !== null) clock.clearTimeout(transition.handle);
      transition = null;
    }

    function armTransition() {
      if (!transition || transition.handle !== null || doc.hidden || destroyed) return;
      transition.due = now() + transition.remaining;
      transition.handle = clock.setTimeout(() => {
        const callback = transition?.callback;
        transition = null;
        callback?.();
      }, transition.remaining);
    }

    function scheduleTransition(kind, delay, callback) {
      clearTransition();
      transition = { callback, due: 0, handle: null, kind, remaining: delay };
      armTransition();
    }

    function pauseTransition() {
      if (!transition || transition.handle === null) return;
      clock.clearTimeout(transition.handle);
      transition.handle = null;
      transition.remaining = Math.max(0, transition.due - now());
    }

    function randomDelay([minimum, maximum]) {
      return minimum + Math.floor(random() * (maximum - minimum + 1));
    }

    function setScene(nextScene) {
      if (currentScene === nextScene) return;
      currentScene = nextScene;
      if (!pointer) character.setScene(nextScene, { resetEyes: false });
    }

    function withReaction(reactionScene) {
      const effect = currentScene.effect;
      return Object.freeze({
        pose: reactionScene.pose,
        expression: reactionScene.expression,
        effect,
        gaze: reactionScene.gaze,
      });
    }

    function chooseAccent(activityName, candidates) {
      const previous = lastAccent.get(activityName);
      const available = candidates.length > 1
        ? candidates.filter((candidate) => candidate.name !== previous)
        : candidates;
      const total = available.reduce((sum, candidate) => sum + candidate.weight, 0);
      let target = random() * total;
      let selected = available[available.length - 1];
      for (const candidate of available) {
        target -= candidate.weight;
        if (target <= 0) {
          selected = candidate;
          break;
        }
      }
      lastAccent.set(activityName, selected.name);
      return selected;
    }

    function stillIn(expectedActivity) {
      return !destroyed && mode === "activity" && activity === expectedActivity;
    }

    function scheduleReturn(expectedActivity, duration) {
      scheduleTransition("activity", duration, () => {
        if (stillIn(expectedActivity)) enterActivity();
      });
    }

    function enterIdle() {
      const elapsed = now() - activityAt;
      if (elapsed >= 15 * 60_000) {
        setScene(SCENES.sleeping);
        return;
      }
      if (elapsed >= 5 * 60_000) {
        setScene(SCENES.drowsy);
        scheduleTransition("activity", randomDelay([18_000, 30_000]), () => {
          if (stillIn("idle")) enterActivity();
        });
        return;
      }
      if (elapsed >= 90_000) {
        setScene(SCENES.idle);
        scheduleTransition("activity", randomDelay([15_000, 25_000]), () => {
          if (!stillIn("idle")) return;
          const accent = chooseAccent("idle-late", [
            { name: "bored", scene: SCENES.bored, weight: 0.65, duration: [4500, 7000] },
            { name: "playful", scene: SCENES.playful, weight: 0.35, duration: [2800, 4200] },
          ]);
          setScene(accent.scene);
          scheduleReturn("idle", randomDelay(accent.duration));
        });
        return;
      }
      if (elapsed >= 30_000) {
        setScene(SCENES.idle);
        scheduleTransition("activity", randomDelay([10_000, 18_000]), () => {
          if (!stillIn("idle")) return;
          const accent = chooseAccent("idle", [
            { name: "curious", scene: SCENES.curious, weight: 0.5, duration: [1800, 3000] },
            { name: "playful", scene: SCENES.playful, weight: 0.35, duration: [2600, 4000] },
            { name: "bouncing", scene: SCENES.bouncing, weight: 0.15, duration: [2200, 3200] },
          ]);
          setScene(accent.scene);
          scheduleReturn("idle", randomDelay(accent.duration));
        });
        return;
      }
      setScene(SCENES.idle);
      scheduleTransition("activity", Math.min(randomDelay([12_000, 20_000]), 30_000 - elapsed), () => {
        if (stillIn("idle")) enterActivity();
      });
    }

    function enterThinking() {
      setScene(SCENES.thinking);
      scheduleTransition("activity", randomDelay([3_000, 6_000]), () => {
        if (!stillIn("thinking")) return;
        const accent = chooseAccent("thinking", [
          { name: "humming", scene: SCENES.humming, weight: 0.72, duration: [6000, 9000] },
          { name: "deep", scene: SCENES.deepThinking, weight: 0.18, duration: [3500, 5500] },
          { name: "radar", scene: SCENES.radar, weight: 0.1, duration: [3200, 4800] },
        ]);
        setScene(accent.scene);
        scheduleReturn("thinking", randomDelay(accent.duration));
      });
    }

    function enterSearching() {
      setScene(SCENES.searching);
      scheduleTransition("activity", randomDelay([3500, 6500]), () => {
        if (!stillIn("searching")) return;
        const accent = chooseAccent("searching", [
          { name: "curious", scene: SCENES.curious, weight: 0.45, duration: [1400, 2400] },
          { name: "radar", scene: SCENES.radar, weight: 0.35, duration: [2500, 4000] },
          { name: "thinking", scene: SCENES.deepThinking, weight: 0.2, duration: [1800, 3000] },
        ]);
        setScene(accent.scene);
        scheduleReturn("searching", randomDelay(accent.duration));
      });
    }

    function enterCoding() {
      setScene(SCENES.coding);
      scheduleTransition("activity", randomDelay([10_000, 16_000]), () => {
        if (!stillIn("coding")) return;
        setScene(SCENES.reviewing);
        if (!pointer) character.spinOnce();
        scheduleReturn("coding", randomDelay([2200, 3200]));
      });
    }

    function scheduleTerminalCheck() {
      scheduleTransition("activity", randomDelay([4500, 7000]), () => {
        if (!stillIn("terminal")) return;
        const elapsed = now() - activityAt;
        const hasRecentOutput = now() - lastProgressAt < 5000;
        if (!hasRecentOutput && elapsed >= 20_000 && random() < 0.4) {
          setScene(SCENES.bored);
          scheduleTransition("activity", randomDelay([1400, 2400]), () => {
            if (!stillIn("terminal")) return;
            setScene(SCENES.loading);
            scheduleTerminalCheck();
          });
          return;
        }
        setScene(SCENES.loading);
        scheduleTerminalCheck();
      });
    }

    function enterTerminal() {
      setScene(SCENES.terminalTyping);
      scheduleTransition("activity", randomDelay([650, 1100]), () => {
        if (!stillIn("terminal")) return;
        setScene(SCENES.loading);
        scheduleTerminalCheck();
      });
    }

    function enterReceiving() {
      setScene(SCENES.receiving);
      scheduleTransition("activity", randomDelay([5000, 8000]), () => {
        if (!stillIn("receiving")) return;
        setScene(SCENES.curious);
        scheduleReturn("receiving", randomDelay([1200, 2200]));
      });
    }

    function enterConsulting() {
      setScene(SCENES.consulting);
      scheduleTransition("activity", randomDelay([4000, 6500]), () => {
        if (!stillIn("consulting")) return;
        setScene(SCENES.deepThinking);
        scheduleReturn("consulting", randomDelay([1800, 3000]));
      });
    }

    function enterTooling() {
      setScene(SCENES.tooling);
      scheduleTransition("activity", randomDelay([4500, 7000]), () => {
        if (!stillIn("tooling")) return;
        setScene(SCENES.loading);
        scheduleReturn("tooling", randomDelay([3000, 5000]));
      });
    }

    function enterReplying() {
      setScene(SCENES.replying);
      scheduleTransition("activity", randomDelay([6000, 10_000]), () => {
        if (!stillIn("replying")) return;
        setScene(SCENES.listening);
        scheduleReturn("replying", randomDelay([700, 1200]));
      });
    }

    function waitForApproval() {
      const elapsed = now() - activityAt;
      setScene(elapsed >= 45_000 ? SCENES.bored : SCENES.listening);
      scheduleTransition("activity", randomDelay([15_000, 25_000]), () => {
        if (!stillIn("awaiting_approval")) return;
        setScene(SCENES.notifying);
        scheduleTransition("activity", 900, () => {
          if (stillIn("awaiting_approval")) waitForApproval();
        });
      });
    }

    function enterApproval() {
      setScene(SCENES.alerting);
      scheduleTransition("activity", 1600, () => {
        if (stillIn("awaiting_approval")) waitForApproval();
      });
    }

    function enterActivity() {
      clearTransition();
      currentCue = null;
      mode = "activity";
      switch (activity) {
        case "idle": enterIdle(); break;
        case "thinking": enterThinking(); break;
        case "searching": enterSearching(); break;
        case "coding": enterCoding(); break;
        case "terminal": enterTerminal(); break;
        case "receiving": enterReceiving(); break;
        case "consulting": enterConsulting(); break;
        case "tooling": enterTooling(); break;
        case "replying": enterReplying(); break;
        case "awaiting_approval": enterApproval(); break;
      }
    }

    function finishProtectedMode() {
      const cue = pendingCue;
      pendingCue = null;
      if (cue) playCueNow(cue);
      else enterActivity();
    }

    function playWaking() {
      clearTransition();
      mode = "waking";
      setScene(SCENES.waking);
      scheduleTransition("protected", WAKING_MS, finishProtectedMode);
    }

    function playCueSequence(cue, steps) {
      clearTransition();
      mode = "cue";
      currentCue = cue;
      let index = 0;
      const play = () => {
        if (mode !== "cue" || currentCue !== cue) return;
        const step = steps[index];
        if (!step) {
          const pending = pendingCue;
          pendingCue = null;
          if (pending) playCueNow(pending);
          else enterActivity();
          return;
        }
        setScene(step.keepEffect ? withReaction(step.scene) : step.scene);
        if (step.wink && !pointer) character.winkOnce();
        index += 1;
        scheduleTransition("cue", step.duration, play);
      };
      play();
    }

    function playCueNow(cue) {
      switch (cue) {
        case "engage":
          playCueSequence(cue, [
            { scene: SCENES.listening, duration: 350 },
            { scene: SCENES.curious, duration: 650 },
          ]);
          break;
        case "reply_sent":
          playCueSequence(cue, [{ scene: SCENES.sending, duration: 850 }]);
          break;
        case "approval_granted":
          playCueSequence(cue, [{ scene: SCENES.happy, duration: 900, keepEffect: true }]);
          break;
        case "approval_denied":
          playCueSequence(cue, [{ scene: SCENES.shy, duration: 900, keepEffect: true }]);
          break;
        case "error_first":
          playCueSequence(cue, [{ scene: SCENES.surprised, duration: 650, keepEffect: true }]);
          break;
        case "error_repeated":
          playCueSequence(cue, [{ scene: SCENES.confused, duration: 1200, keepEffect: true }]);
          break;
        case "error_stubborn":
          playCueSequence(cue, [{ scene: SCENES.angry, duration: 1400, keepEffect: true }]);
          break;
        case "completed_quick":
          playCueSequence(cue, [
            { scene: SCENES.quickHappy, duration: 900, wink: true },
            { scene: SCENES.notifying, duration: 1500 },
          ]);
          break;
        case "completed_normal":
          playCueSequence(cue, [
            { scene: SCENES.proud, duration: 1500 },
            { scene: SCENES.notifying, duration: 2200 },
          ]);
          break;
        case "completed_hard":
          playCueSequence(cue, [
            { scene: SCENES.celebrate, duration: 2500 },
            { scene: SCENES.notifying, duration: 2500 },
          ]);
          break;
        case "run_failed":
          playCueSequence(cue, [
            { scene: SCENES.sad, duration: 1800 },
            { scene: SCENES.notifying, duration: 1600 },
          ]);
          break;
        case "run_aborted":
          playCueSequence(cue, [{ scene: SCENES.surprised, duration: 600 }]);
          break;
      }
    }

    function cuePriority(cue) {
      return CUES[cue].priority;
    }

    function requestCue(cue) {
      if (cue === "progress") {
        lastProgressAt = now();
        return;
      }
      if (PROTECTED_MODES.has(mode)) {
        if (!pendingCue || cuePriority(cue) > cuePriority(pendingCue)) pendingCue = cue;
        return;
      }
      if (mode === "cue") {
        if (currentCue === "reply_sent" && COMPLETION_CUES.has(cue)) {
          pendingCue = cue;
        } else if (cuePriority(cue) > cuePriority(currentCue)) {
          playCueNow(cue);
        } else if (!pendingCue || cuePriority(cue) > cuePriority(pendingCue)) {
          pendingCue = cue;
        }
        return;
      }
      playCueNow(cue);
    }

    function scheduleActivitySwitch() {
      scheduleTransition("activity-switch", ACTIVITY_SETTLE_MS, () => {
        if (activity !== "idle" && (currentScene === SCENES.sleeping || currentScene === SCENES.drowsy)) {
          playWaking();
        } else {
          enterActivity();
        }
      });
    }

    function update(next) {
      if (
        destroyed
        || next === null
        || typeof next !== "object"
        || typeof next.activity !== "string"
        || !hasOwn(ACTIVITIES, next.activity)
      ) return false;
      const cue = next.cue;
      if (cue !== undefined && (typeof cue !== "string" || !hasOwn(CUES, cue))) return false;

      const changed = next.activity !== activity;
      if (changed) {
        activity = next.activity;
        activityAt = now();
        if (activity !== "terminal") lastProgressAt = -Infinity;
        if (activity !== "idle" && mode === "cue" && COMPLETION_CUES.has(currentCue)) {
          clearTransition();
          currentCue = null;
          mode = "activity";
          pendingCue = null;
        }
      }

      if (activity === "awaiting_approval" && cue === undefined) {
        enterActivity();
        return true;
      }
      if (typeof cue === "string") {
        if (cue === "engage" && (currentScene === SCENES.sleeping || currentScene === SCENES.drowsy)) {
          pendingCue = cue;
          playWaking();
        } else {
          requestCue(cue);
        }
        return true;
      }
      if (PROTECTED_MODES.has(mode) || mode === "cue") return true;
      if (changed) scheduleActivitySwitch();
      return true;
    }

    function finishStartup() {
      if (mode === "startup") finishProtectedMode();
    }

    function applyReducedMotion() {
      character.setReduceMotion(motionQuery.matches || reduceMotionPreference);
    }

    function setPreferences(preferences) {
      if (destroyed || preferences === null || typeof preferences !== "object") return false;
      if (typeof preferences.shape === "string" && hasOwn(g.GROK_GEO.shapes, preferences.shape)) {
        character.setShape(preferences.shape);
      }
      if (typeof preferences.color === "string" && hasOwn(g.GROK_GEO.palette, preferences.color)) {
        character.setColor(preferences.color);
      }
      if (typeof preferences.body_color === "string") {
        character.setInk(preferences.body_color);
      }
      if (typeof preferences.eye_color === "string") {
        character.setEyeColor(preferences.eye_color);
      }
      if (preferences.scheme === "light" || preferences.scheme === "dark") {
        character.setColor(character.colorId, preferences.scheme);
      }
      if (typeof preferences.followPointer === "boolean") {
        character.setFollowPointer(preferences.followPointer);
      }
      if (typeof preferences.reduceMotion === "boolean") {
        reduceMotionPreference = preferences.reduceMotion;
        applyReducedMotion();
      }
      return true;
    }

    function onMotionChange() {
      applyReducedMotion();
    }

    function onVisibilityChange() {
      if (doc.hidden) {
        pauseTransition();
        character.setPaused(true);
      } else {
        character.setPaused(false);
        armTransition();
      }
    }

    function flushDrag() {
      if (!pointer) return;
      const dx = pointer.dx;
      const dy = pointer.dy;
      pointer.dx = 0;
      pointer.dy = 0;
      if (dx !== 0 || dy !== 0) options.postDrag({ phase: "move", dx, dy });
    }

    function onDragFrame() {
      if (!pointer) return;
      pointer.frame = null;
      flushDrag();
    }

    function onPointerDown(event) {
      if (event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, frame: null };
      doc.body.setPointerCapture(event.pointerId);
      doc.body.classList.add("dragging");
      character.setState("dragging", { resetEyes: false });
      options.postDrag({ phase: "start" });
    }

    function onPointerMove(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if ((event.buttons & 1) === 0) {
        onPointerEnd(event);
        return;
      }
      pointer.dx += event.clientX - pointer.x;
      pointer.dy += event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (pointer.frame === null) pointer.frame = frameClock.requestAnimationFrame(onDragFrame);
    }

    function onPointerEnd(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (pointer.frame !== null) frameClock.cancelAnimationFrame(pointer.frame);
      flushDrag();
      pointer = null;
      doc.body.classList.remove("dragging");
      character.setScene(currentScene, { resetEyes: false });
      options.postDrag({ phase: "end" });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTransition();
      if (pointer && pointer.frame !== null) frameClock.cancelAnimationFrame(pointer.frame);
      motionQuery.removeEventListener("change", onMotionChange);
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      doc.body.removeEventListener("pointerdown", onPointerDown);
      doc.body.removeEventListener("pointermove", onPointerMove);
      doc.body.removeEventListener("pointerup", onPointerEnd);
      doc.body.removeEventListener("pointercancel", onPointerEnd);
      doc.body.removeEventListener("lostpointercapture", onPointerEnd);
      character.destroy();
    }

    motionQuery.addEventListener("change", onMotionChange);
    doc.addEventListener("visibilitychange", onVisibilityChange);
    doc.body.addEventListener("pointerdown", onPointerDown);
    doc.body.addEventListener("pointermove", onPointerMove);
    doc.body.addEventListener("pointerup", onPointerEnd);
    doc.body.addEventListener("pointercancel", onPointerEnd);
    doc.body.addEventListener("lostpointercapture", onPointerEnd);
    applyReducedMotion();
    scheduleTransition("protected", STARTUP_MS, finishStartup);
    if (doc.hidden) character.setPaused(true);

    return Object.freeze({ destroy, setPreferences, update });
  }

  g.OPetRenderer = Object.freeze({ create });
})(window);
