/* o-pet 行为导演。空闲深度独立于画面，动作片段按阶段、历史、冷却和能量选择。 */
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
  const STARTLED_MS = 650;
  const QUIZZICAL_MS = 2200;
  const POKE_WINDOW_MS = 25_000;
  const POKE_THRESHOLD = 3;
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
    dreaming: scene("dreaming", "sleeping", null, "sleeping"),
    stretching: scene("stretching", "drowsy", null, "idle"),
    startled: scene("startled", "startled", null, "startled"),
    quizzical: scene("quizzical", "quizzical", null, "front"),
    dragging: scene("dragging"),
    frontAttention: scene("listening", "curious", null, "front"),
    sleepyCurious: scene("curious", "drowsy", null, "drowsy"),
    bored: scene("bored", "bored", null, "bored"),
    playful: scene("playful", "playful", null, "playful"),
    jumping: scene("playful", "happy", null, "playful"),
    gazeListening: scene("idle", "listening", null, "listening"),
    gazeSearching: scene("idle", "idle", null, "searching"),
    gazeCurious: scene("idle", "curious", null, "curious"),
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
    const rawNow = options.now || (() => performance.now());
    let hiddenAt = doc.hidden ? rawNow() : null;
    let hiddenDuration = 0;
    const now = () => {
      const raw = rawNow();
      return raw - hiddenDuration - (hiddenAt === null ? 0 : raw - hiddenAt);
    };
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
    let interaction = null;
    let reduceMotionPreference = false;
    let transition = null;
    let idleSession = null;
    let idleDepth = "awake";
    let idleRecoveryUntil = 0;
    let idleQuietUntil = 0;
    let wakeBeforeActivity = false;
    let energyBudget = 3;
    let previousEnergy = "low";
    let recentFragments = [];
    let pokeTimes = [];
    let lastHoverAt = -Infinity;
    const fragmentLastAt = new Map();
    const lastAccent = new Map();
    const lastDirection = new Map();

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
      transition = { callback, due: 0, handle: null, kind, remaining: Math.max(0, delay) };
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

    function chooseDirection(key) {
      let direction = random() < 0.5 ? -1 : 1;
      if (lastDirection.get(key) === direction) direction *= -1;
      lastDirection.set(key, direction);
      return direction;
    }

    function withDetails(base, details) {
      return Object.freeze({ ...base, ...details });
    }

    function setScene(nextScene) {
      if (currentScene === nextScene) return;
      currentScene = nextScene;
      if (!pointer || !interaction?.visualOnly) character.setScene(nextScene, { resetEyes: false });
    }

    function setGazeTarget(target) {
      character.setGazeTarget(target);
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

    function performStep(step) {
      setScene(step.scene);
      if (step.wink) character.winkOnce();
      if (step.spin) character.spinOnce(step.spin.turns, step.spin.direction);
      if (step.bounce) character.bounceOnce();
      if (step.pounce) character.pounceOnce(step.pounce.direction, step.pounce.strength);
    }

    function playSequence(sequenceMode, steps, onComplete) {
      clearTransition();
      mode = sequenceMode;
      let index = 0;
      const play = () => {
        if (destroyed || mode !== sequenceMode) return;
        const step = steps[index];
        if (!step) {
          onComplete();
          return;
        }
        index += 1;
        performStep(step);
        scheduleTransition(sequenceMode, step.duration, play);
      };
      play();
    }

    function createIdleSession(startedAt) {
      const relaxedAt = randomDelay([90_000, 150_000]);
      const drowsyAt = Math.max(relaxedAt + 60_000, randomDelay([240_000, 420_000]));
      const sleepingAt = Math.max(drowsyAt + 180_000, randomDelay([600_000, 900_000]));
      return { startedAt, relaxedAt, drowsyAt, sleepingAt };
    }

    function resetIdleSession(startedAt = now()) {
      idleSession = createIdleSession(startedAt);
      idleDepth = "awake";
      idleRecoveryUntil = 0;
      idleQuietUntil = 0;
      energyBudget = 3;
      previousEnergy = "low";
      recentFragments = [];
      fragmentLastAt.clear();
    }

    function idleDepthAt(at) {
      if (!idleSession) return "awake";
      const elapsed = at - idleSession.startedAt;
      if (elapsed >= idleSession.sleepingAt) {
        return at < idleRecoveryUntil ? "drowsy" : "sleeping";
      }
      if (elapsed >= idleSession.drowsyAt) return "drowsy";
      if (elapsed >= idleSession.relaxedAt) return "relaxed";
      return "awake";
    }

    function syncIdleDepth() {
      idleDepth = idleDepthAt(now());
      return idleDepth;
    }

    function nextDepthBoundary() {
      if (!idleSession) return Infinity;
      const at = now();
      const elapsed = at - idleSession.startedAt;
      if (elapsed < idleSession.relaxedAt) return idleSession.startedAt + idleSession.relaxedAt;
      if (elapsed < idleSession.drowsyAt) return idleSession.startedAt + idleSession.drowsyAt;
      if (elapsed < idleSession.sleepingAt) return idleSession.startedAt + idleSession.sleepingAt;
      if (at < idleRecoveryUntil) return idleRecoveryUntil;
      return Infinity;
    }

    function idleBaseScene(depth = idleDepth) {
      if (depth === "drowsy") return SCENES.drowsy;
      if (depth === "sleeping") return SCENES.sleeping;
      return SCENES.idle;
    }

    const IDLE_FRAGMENTS = [
      {
        name: "notice",
        phases: ["awake", "relaxed"],
        energy: "low",
        weight: 5,
        cooldown: 20_000,
        build() {
          const direction = chooseDirection("notice");
          const found = random() < 0.35;
          return [
            { scene: withDetails(SCENES.gazeListening, { direction }), duration: 250 },
            { scene: withDetails(SCENES.listening, { direction }), duration: 450 },
            { scene: withDetails(SCENES.curious, { direction }), duration: 900 },
            found
              ? { scene: withDetails(SCENES.playful, { direction }), duration: 600, pounce: { direction, strength: 0.4 } }
              : { scene: withDetails(SCENES.idle, { direction }), duration: 700 },
            ...(found ? [{ scene: SCENES.happy, duration: 900 }] : []),
          ];
        },
      },
      {
        name: "patrol",
        phases: ["awake", "relaxed"],
        energy: "low",
        weight: 3,
        cooldown: 30_000,
        build() {
          const direction = chooseDirection("patrol");
          return [
            { scene: withDetails(SCENES.gazeSearching, { direction }), duration: 250 },
            { scene: withDetails(SCENES.searching, { direction }), duration: 1500 },
            { scene: withDetails(SCENES.searching, { direction: -direction }), duration: 650 },
            { scene: SCENES.proud, duration: 1000 },
          ];
        },
      },
      {
        name: "pounce",
        phases: ["awake"],
        energy: "medium",
        weight: 2,
        cooldown: 35_000,
        build() {
          const direction = chooseDirection("pounce");
          const success = random() < 0.55;
          return [
            { scene: withDetails(SCENES.gazeCurious, { direction }), duration: 250 },
            { scene: withDetails(SCENES.curious, { direction }), duration: 400 },
            { scene: withDetails(SCENES.playful, { direction }), duration: 500 },
            { scene: withDetails(SCENES.jumping, { direction }), duration: 1050, pounce: { direction, strength: 1 } },
            ...(success
              ? [{ scene: SCENES.happy, duration: 900 }]
              : [{ scene: SCENES.surprised, duration: 600 }, { scene: SCENES.shy, duration: 900 }]),
          ];
        },
      },
      {
        name: "bounce-practice",
        phases: ["awake"],
        energy: "high",
        weight: 1.4,
        cooldown: 75_000,
        build() {
          const failed = random() < 0.18;
          return [
            { scene: SCENES.playful, duration: 700 },
            { scene: SCENES.jumping, duration: 1800, bounce: true },
            ...(failed
              ? [{ scene: SCENES.surprised, duration: 650 }, { scene: SCENES.shy, duration: 800 }]
              : [{ scene: SCENES.happy, duration: 1000 }]),
          ];
        },
      },
      {
        name: "spin-challenge",
        phases: ["awake"],
        energy: "high",
        weight: 0.9,
        cooldown: 90_000,
        build() {
          const direction = chooseDirection("spin");
          const result = random();
          const ending = result < 0.62
            ? [{ scene: SCENES.proud, duration: 1100 }]
            : result < 0.96
              ? [{ scene: SCENES.shy, duration: 1300 }]
              : [{ scene: SCENES.quickHappy, duration: 900, wink: true, pounce: { direction, strength: 0.35 } }];
          return [
            { scene: withDetails(SCENES.playful, { direction: -direction }), duration: 500 },
            { scene: withDetails(SCENES.playful, { direction }), duration: 1400, spin: { turns: 1, direction } },
            ...ending,
          ];
        },
      },
      {
        name: "stretch",
        phases: ["awake", "relaxed"],
        energy: "medium",
        weight: 2,
        cooldown: 40_000,
        build() {
          const direction = chooseDirection("stretch");
          return [
            { scene: withDetails(SCENES.stretching, { direction }), duration: 3500 },
            { scene: SCENES.happy, duration: 800 },
          ];
        },
      },
      {
        name: "quiet-observe",
        phases: ["relaxed"],
        energy: "low",
        weight: 4,
        cooldown: 18_000,
        build() {
          const direction = chooseDirection("observe");
          return [
            { scene: withDetails(SCENES.listening, { direction }), duration: 1200 },
            { scene: SCENES.idle, duration: 900 },
          ];
        },
      },
      {
        name: "self-entertain",
        phases: ["relaxed"],
        energy: "medium",
        weight: 2.2,
        cooldown: 40_000,
        build() {
          return [
            { scene: SCENES.bored, duration: 1600 },
            { scene: SCENES.curious, duration: 900 },
            { scene: SCENES.playful, duration: 800 },
          ];
        },
      },
      {
        name: "sleepy-nod",
        phases: ["drowsy"],
        energy: "low",
        weight: 5,
        cooldown: 20_000,
        build() {
          return [
            { scene: SCENES.drowsy, duration: 2200 },
            { scene: SCENES.surprised, duration: 600 },
            { scene: SCENES.drowsy, duration: 900 },
          ];
        },
      },
      {
        name: "resist-sleep",
        phases: ["drowsy"],
        energy: "medium",
        weight: 2.2,
        cooldown: 40_000,
        build() {
          const direction = chooseDirection("sleepy-stretch");
          return [
            { scene: withDetails(SCENES.stretching, { direction }), duration: 3500 },
            { scene: SCENES.happy, duration: 700 },
            { scene: SCENES.drowsy, duration: 900 },
          ];
        },
      },
      {
        name: "half-awake",
        phases: ["drowsy"],
        energy: "low",
        weight: 2.5,
        cooldown: 30_000,
        build() {
          const direction = chooseDirection("half-awake");
          return [
            { scene: withDetails(SCENES.sleepyCurious, { direction }), duration: 1600 },
            { scene: SCENES.drowsy, duration: 1000 },
          ];
        },
      },
      {
        name: "sleepy-play",
        phases: ["drowsy"],
        energy: "medium",
        weight: 1,
        cooldown: 70_000,
        build() {
          return [
            { scene: SCENES.playful, duration: 900 },
            { scene: SCENES.drowsy, duration: 1300 },
          ];
        },
      },
      ...["float", "curl", "twitch"].map((variant) => ({
        name: `dream-${variant}`,
        phases: ["sleeping"],
        energy: "low",
        weight: 1,
        cooldown: 35_000,
        build() {
          return [{
            scene: withDetails(SCENES.dreaming, {
              direction: variant === "curl" ? chooseDirection("dream-curl") : 0,
              variant,
            }),
            duration: randomDelay([6000, 10_000]),
          }];
        },
      })),
    ];

    function selectIdleFragment() {
      const at = now();
      const recent = new Set(recentFragments.slice(-3));
      const supportsEnergy = (fragment) => fragment.energy !== "high"
        || (energyBudget >= 3 && previousEnergy !== "high");
      const cooled = (fragment) => at - (fragmentLastAt.get(fragment.name) ?? -Infinity) >= fragment.cooldown;
      const phaseCandidates = IDLE_FRAGMENTS.filter((fragment) => (
        fragment.phases.includes(idleDepth) && cooled(fragment) && supportsEnergy(fragment)
      ));
      let candidates = phaseCandidates.filter((fragment) => !recent.has(fragment.name));
      if (candidates.length === 0) {
        const previous = recentFragments.at(-1);
        candidates = phaseCandidates.filter((fragment) => fragment.name !== previous);
      }
      if (candidates.length === 0) return null;
      const total = candidates.reduce((sum, fragment) => sum + fragment.weight, 0);
      let target = random() * total;
      let selected = candidates[candidates.length - 1];
      for (const candidate of candidates) {
        target -= candidate.weight;
        if (target <= 0) {
          selected = candidate;
          break;
        }
      }
      fragmentLastAt.set(selected.name, at);
      recentFragments.push(selected.name);
      if (recentFragments.length > 6) recentFragments.shift();
      if (selected.energy === "high") energyBudget = 0;
      else if (selected.energy === "low") energyBudget = Math.min(3, energyBudget + 1);
      else energyBudget = Math.min(3, energyBudget + 0.5);
      previousEnergy = selected.energy;
      return selected;
    }

    function idleInterval() {
      if (idleDepth === "relaxed") return randomDelay([8000, 14_000]);
      if (idleDepth === "drowsy") return randomDelay([10_000, 18_000]);
      if (idleDepth === "sleeping") return randomDelay([18_000, 30_000]);
      return randomDelay([5000, 9000]);
    }

    function enterIdleDirector() {
      clearTransition();
      currentCue = null;
      mode = "idle";
      setGazeTarget(null);
      const previousDepth = idleDepth;
      syncIdleDepth();
      setScene(idleBaseScene());
      let delay = idleInterval();
      if (idleQuietUntil > now()) delay = Math.max(delay, idleQuietUntil - now());
      const boundary = nextDepthBoundary();
      delay = Math.min(delay, boundary - now());
      scheduleTransition("idle", delay, () => {
        if (activity !== "idle" || mode !== "idle") return;
        syncIdleDepth();
        if (idleDepth !== previousDepth || now() >= boundary) {
          enterIdleDirector();
          return;
        }
        const fragment = selectIdleFragment();
        if (!fragment) {
          enterIdleDirector();
          return;
        }
        const wasHigh = fragment.energy === "high";
        playSequence("idle-fragment", fragment.build(), () => {
          if (activity !== "idle" || mode !== "idle-fragment") return;
          if (wasHigh) idleQuietUntil = now() + randomDelay([20_000, 30_000]);
          enterIdleDirector();
        });
      });
    }

    function playUserGaze() {
      if (
        activity !== "idle"
        || pointer
        || (mode !== "idle" && mode !== "idle-fragment")
        || now() - lastHoverAt < 45_000
      ) return;
      syncIdleDepth();
      if (idleDepth !== "awake" && idleDepth !== "relaxed") return;
      lastHoverAt = now();
      const steps = [
        { scene: SCENES.curious, duration: 500 },
        { scene: SCENES.frontAttention, duration: 1300 },
      ];
      if (random() < 0.18) steps.push({ scene: SCENES.quickHappy, duration: 700, wink: true });
      playSequence("idle-fragment", steps, () => {
        if (activity === "idle" && mode === "idle-fragment") enterIdleDirector();
      });
    }

    function stillIn(expectedActivity) {
      return !destroyed && mode === "activity" && activity === expectedActivity;
    }

    function scheduleReturn(expectedActivity, duration) {
      scheduleTransition("activity", duration, () => {
        if (stillIn(expectedActivity)) enterActivity();
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
        character.spinOnce();
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
      wakeBeforeActivity = false;
      setGazeTarget(null);
      if (activity === "idle") {
        if (!idleSession) resetIdleSession();
        enterIdleDirector();
        return;
      }
      mode = "activity";
      switch (activity) {
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
      setGazeTarget(null);
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
        if (step.wink) character.winkOnce();
        index += 1;
        scheduleTransition("cue", step.duration, play);
      };
      play();
    }

    function playCueNow(cue) {
      interaction = null;
      setGazeTarget(null);
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
        if (activity !== "idle" && wakeBeforeActivity) playWaking();
        else enterActivity();
      });
    }

    function leaveIdleSession() {
      syncIdleDepth();
      wakeBeforeActivity = idleDepth === "drowsy" || idleDepth === "sleeping";
      idleSession = null;
      idleRecoveryUntil = 0;
      idleQuietUntil = 0;
      pokeTimes = [];
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

      const previousActivity = activity;
      const changed = next.activity !== activity;
      if (changed) {
        if (previousActivity === "idle" && next.activity !== "idle") leaveIdleSession();
        activity = next.activity;
        activityAt = now();
        if (activity === "idle") resetIdleSession(activityAt);
        if (activity !== "terminal") lastProgressAt = -Infinity;
        if (activity !== "idle" && mode === "cue" && COMPLETION_CUES.has(currentCue)) {
          clearTransition();
          currentCue = null;
          mode = "activity";
          pendingCue = null;
        }
        if (mode === "interaction" || mode === "idle-fragment" || mode === "idle") {
          interaction = null;
          setGazeTarget(null);
        }
      }

      if (activity === "awaiting_approval" && cue === undefined) {
        enterActivity();
        return true;
      }
      if (typeof cue === "string") {
        if (wakeBeforeActivity && activity !== "idle") {
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
      if (typeof preferences.body_color === "string") character.setInk(preferences.body_color);
      if (typeof preferences.eye_color === "string") character.setEyeColor(preferences.eye_color);
      if (preferences.scheme === "light" || preferences.scheme === "dark") {
        character.setColor(character.colorId, preferences.scheme);
      }
      if (typeof preferences.followPointer === "boolean") character.setFollowPointer(preferences.followPointer);
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
        if (hiddenAt === null) hiddenAt = rawNow();
        pauseTransition();
        character.setPaused(true);
      } else {
        if (hiddenAt !== null) {
          hiddenDuration += rawNow() - hiddenAt;
          hiddenAt = null;
        }
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

    function recordPoke() {
      const cutoff = now() - POKE_WINDOW_MS;
      pokeTimes = pokeTimes.filter((at) => at >= cutoff);
      pokeTimes.push(now());
      if (pokeTimes.length < POKE_THRESHOLD) return false;
      pokeTimes = [];
      return true;
    }

    function finishFullWake() {
      interaction = null;
      if (activity === "idle" && mode === "interaction-wake") enterIdleDirector();
    }

    function startFullWake() {
      resetIdleSession(now());
      const direction = chooseDirection("wake-stretch");
      playSequence("interaction-wake", [
        { scene: withDetails(SCENES.stretching, { direction }), duration: 3500 },
        { scene: SCENES.playful, duration: 700 },
        { scene: SCENES.happy, duration: 900 },
      ], finishFullWake);
    }

    function finishQuizzical() {
      if (!interaction || activity !== "idle") {
        interaction = null;
        enterActivity();
        return;
      }
      if (interaction.fullWake) {
        startFullWake();
        return;
      }
      if (interaction.depth === "sleeping") {
        idleRecoveryUntil = now() + randomDelay([20_000, 40_000]);
      }
      interaction = null;
      enterIdleDirector();
    }

    function beginQuizzical() {
      if (!interaction || activity !== "idle") {
        interaction = null;
        enterActivity();
        return;
      }
      interaction.stage = "quizzical";
      setGazeTarget(null);
      const direction = chooseDirection("quizzical");
      setScene(withDetails(SCENES.quizzical, { direction }));
      mode = "interaction";
      scheduleTransition("interaction", QUIZZICAL_MS, finishQuizzical);
    }

    function finishStartled() {
      if (!interaction || interaction.stage !== "startled" || activity !== "idle") return;
      setGazeTarget(null);
      if (pointer) {
        interaction.stage = "dragging";
        setScene(SCENES.dragging);
      } else {
        beginQuizzical();
      }
    }

    function contactDirection(clientX) {
      const width = typeof g.innerWidth === "number" && g.innerWidth > 0 ? g.innerWidth : 1;
      return clientX < width / 2 ? 1 : -1;
    }

    function onPointerDown(event) {
      if (event.button !== 0 || pointer) return;
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
      options.postDrag({ phase: "start" });

      if (PROTECTED_MODES.has(mode)) {
        interaction = { idle: false, moved: false, stage: "dragging", visualOnly: true };
        character.setScene(SCENES.dragging, { resetEyes: false });
        return;
      }

      const idleInteraction = activity === "idle";
      const depth = idleInteraction ? idleDepthAt(now()) : null;
      interaction = {
        contact: { x: event.clientX, y: event.clientY },
        depth,
        fullWake: idleInteraction && recordPoke(),
        idle: idleInteraction,
        moved: false,
        stage: depth === "sleeping" ? "startled" : "dragging",
      };
      clearTransition();
      currentCue = null;
      mode = "interaction";
      if (depth === "sleeping") {
        setGazeTarget(interaction.contact);
        setScene(withDetails(SCENES.startled, { direction: contactDirection(event.clientX) }));
        scheduleTransition("interaction", STARTLED_MS, finishStartled);
      } else {
        setScene(SCENES.dragging);
      }
    }

    function onPointerMove(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if ((event.buttons & 1) === 0) {
        onPointerEnd(event);
        return;
      }
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.dx += dx;
      pointer.dy += dy;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (dx !== 0 || dy !== 0) {
        pointer.moved = true;
        if (interaction) interaction.moved = true;
      }
      if (pointer.frame === null) pointer.frame = frameClock.requestAnimationFrame(onDragFrame);
    }

    function onPointerEnd(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (pointer.frame !== null) frameClock.cancelAnimationFrame(pointer.frame);
      flushDrag();
      pointer = null;
      doc.body.classList.remove("dragging");
      options.postDrag({ phase: "end" });

      if (!interaction) return;
      if (interaction.visualOnly) {
        interaction = null;
        character.setScene(currentScene, { resetEyes: false });
        return;
      }
      if (!interaction.idle || activity !== "idle") {
        interaction = null;
        enterActivity();
        return;
      }
      if (interaction.stage === "startled") return;
      beginQuizzical();
    }

    function onPointerEnter() {
      playUserGaze();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTransition();
      if (pointer && pointer.frame !== null) frameClock.cancelAnimationFrame(pointer.frame);
      pointer = null;
      interaction = null;
      pokeTimes = [];
      recentFragments = [];
      motionQuery.removeEventListener("change", onMotionChange);
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      doc.body.removeEventListener("pointerenter", onPointerEnter);
      doc.body.removeEventListener("pointerdown", onPointerDown);
      doc.body.removeEventListener("pointermove", onPointerMove);
      doc.body.removeEventListener("pointerup", onPointerEnd);
      doc.body.removeEventListener("pointercancel", onPointerEnd);
      doc.body.removeEventListener("lostpointercapture", onPointerEnd);
      character.destroy();
    }

    resetIdleSession(activityAt);
    motionQuery.addEventListener("change", onMotionChange);
    doc.addEventListener("visibilitychange", onVisibilityChange);
    doc.body.addEventListener("pointerenter", onPointerEnter);
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
