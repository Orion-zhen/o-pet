/* 空闲行为导演。独立管理空闲深度、片段历史、冷却和能量。 */
(function (g) {
  function create(options) {
    const { now, presets, random, scenes, timeline } = options;
    const fragmentLastAt = new Map();
    const lastDirection = new Map();
    let session = null;
    let depth = "awake";
    let recoveryUntil = 0;
    let quietUntil = 0;
    let energyBudget = 3;
    let previousEnergy = "low";
    let recentFragments = [];
    let pokeTimes = [];
    let lastHoverAt = -Infinity;
    let phase = "stopped";
    let generation = 0;

    const randomDelay = ([minimum, maximum]) =>
      minimum + Math.floor(random() * (maximum - minimum + 1));
    const HAPPY_SCENE_MS = 1400;
    const PLAYFUL_SCENE_MS = 3000;
    const PROUD_SCENE_MS = 2200;
    const QUICK_HAPPY_SCENE_MS = 900;
    const SEARCHING_SCENE_MS = 3500;
    const STRETCHING_SCENE_MS = 3500;

    function chooseDirection(key) {
      let direction = random() < 0.5 ? -1 : 1;
      if (lastDirection.get(key) === direction) direction *= -1;
      lastDirection.set(key, direction);
      return direction;
    }

    const withDetails = (base, details) => presets.withDetails(base, details);

    const fragments = [
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
            {
              scene: withDetails(scenes.gazeListening, { direction }),
              duration: 250,
            },
            {
              scene: withDetails(scenes.listening, { direction }),
              duration: 450,
            },
            {
              scene: withDetails(scenes.curious, { direction }),
              duration: 900,
            },
            found
              ? {
                  scene: withDetails(scenes.playful, { direction }),
                  duration: PLAYFUL_SCENE_MS,
                  pounce: { direction, strength: 0.4 },
                }
              : {
                  scene: withDetails(scenes.idle, { direction }),
                  duration: 700,
                },
            ...(found
              ? [{ scene: scenes.happy, duration: HAPPY_SCENE_MS }]
              : []),
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
            {
              scene: withDetails(scenes.gazeSearching, { direction }),
              duration: 250,
            },
            {
              scene: withDetails(scenes.searching, { direction }),
              duration: SEARCHING_SCENE_MS,
            },
            {
              scene: withDetails(scenes.searching, { direction: -direction }),
              duration: 650,
            },
            { scene: scenes.proud, duration: PROUD_SCENE_MS },
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
            {
              scene: withDetails(scenes.gazeCurious, { direction }),
              duration: 250,
            },
            {
              scene: withDetails(scenes.curious, { direction }),
              duration: 400,
            },
            {
              scene: withDetails(scenes.playful, { direction }),
              duration: PLAYFUL_SCENE_MS,
            },
            {
              scene: withDetails(scenes.jumping, { direction }),
              duration: 1050,
              pounce: { direction, strength: 1 },
            },
            ...(success
              ? [{ scene: scenes.happy, duration: HAPPY_SCENE_MS }]
              : [
                  { scene: scenes.surprised, duration: 600 },
                  { scene: scenes.shy, duration: 900 },
                ]),
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
            { scene: scenes.playful, duration: PLAYFUL_SCENE_MS },
            { scene: scenes.jumping, duration: 1800, hop: true },
            ...(failed
              ? [
                  { scene: scenes.surprised, duration: 650 },
                  { scene: scenes.shy, duration: 800 },
                ]
              : [{ scene: scenes.happy, duration: HAPPY_SCENE_MS }]),
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
          const ending =
            result < 0.62
              ? [{ scene: scenes.proud, duration: PROUD_SCENE_MS }]
              : result < 0.96
                ? [{ scene: scenes.shy, duration: 1300 }]
                : [
                    {
                      scene: scenes.quickHappy,
                      duration: 900,
                      wink: true,
                      pounce: { direction, strength: 0.35 },
                    },
                  ];
          return [
            {
              scene: withDetails(scenes.playful, { direction: -direction }),
              duration: PLAYFUL_SCENE_MS,
            },
            {
              scene: withDetails(scenes.playful, { direction }),
              duration: PLAYFUL_SCENE_MS,
            },
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
            {
              scene: withDetails(scenes.stretching, { direction }),
              duration: STRETCHING_SCENE_MS,
            },
            { scene: scenes.happy, duration: HAPPY_SCENE_MS },
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
            {
              scene: withDetails(scenes.listening, { direction }),
              duration: 1200,
            },
            { scene: scenes.idle, duration: 900 },
          ];
        },
      },
      {
        name: "self-entertain",
        phases: ["relaxed"],
        energy: "medium",
        weight: 2.2,
        cooldown: 40_000,
        build: () => [
          { scene: scenes.bored, duration: 1600 },
          { scene: scenes.curious, duration: 900 },
          { scene: scenes.playful, duration: PLAYFUL_SCENE_MS },
        ],
      },
      {
        name: "sleepy-nod",
        phases: ["drowsy"],
        energy: "low",
        weight: 5,
        cooldown: 20_000,
        build: () => [
          { scene: scenes.drowsy, duration: 2200 },
          { scene: scenes.surprised, duration: 600 },
          { scene: scenes.drowsy, duration: 900 },
        ],
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
            {
              scene: withDetails(scenes.stretching, { direction }),
              duration: STRETCHING_SCENE_MS,
            },
            { scene: scenes.happy, duration: HAPPY_SCENE_MS },
            { scene: scenes.drowsy, duration: 900 },
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
            {
              scene: withDetails(scenes.sleepyCurious, { direction }),
              duration: 1600,
            },
            { scene: scenes.drowsy, duration: 1000 },
          ];
        },
      },
      {
        name: "sleepy-play",
        phases: ["drowsy"],
        energy: "medium",
        weight: 1,
        cooldown: 70_000,
        build: () => [
          { scene: scenes.playful, duration: PLAYFUL_SCENE_MS },
          { scene: scenes.drowsy, duration: 1300 },
        ],
      },
      ...["float", "curl", "twitch"].map((variant) => ({
        name: `dream-${variant}`,
        phases: ["sleeping"],
        energy: "low",
        weight: 1,
        cooldown: 35_000,
        build() {
          return [
            {
              scene: withDetails(scenes.dreaming, {
                direction:
                  variant === "curl" ? chooseDirection("dream-curl") : 0,
                variant,
              }),
              duration: randomDelay([6000, 10_000]),
            },
          ];
        },
      })),
    ];

    function createSession(startedAt) {
      const relaxedAt = randomDelay([90_000, 150_000]);
      const drowsyAt = Math.max(
        relaxedAt + 60_000,
        randomDelay([240_000, 420_000]),
      );
      const sleepingAt = Math.max(
        drowsyAt + 180_000,
        randomDelay([600_000, 900_000]),
      );
      const wakeAt = sleepingAt + randomDelay([300_000, 480_000]);
      return { startedAt, relaxedAt, drowsyAt, sleepingAt, wakeAt };
    }

    function reset(startedAt = now()) {
      session = createSession(startedAt);
      depth = "awake";
      recoveryUntil = 0;
      quietUntil = 0;
      energyBudget = 3;
      previousEnergy = "low";
      recentFragments = [];
      fragmentLastAt.clear();
    }

    function depthAt(at = now()) {
      if (!session) return "awake";
      const elapsed = at - session.startedAt;
      if (elapsed >= session.wakeAt) return "awake";
      if (elapsed >= session.sleepingAt)
        return at < recoveryUntil ? "drowsy" : "sleeping";
      if (elapsed >= session.drowsyAt) return "drowsy";
      if (elapsed >= session.relaxedAt) return "relaxed";
      return "awake";
    }

    function syncDepth() {
      depth = depthAt();
      return depth;
    }

    function nextBoundary() {
      if (!session) return Infinity;
      const at = now();
      const elapsed = at - session.startedAt;
      if (elapsed < session.relaxedAt)
        return session.startedAt + session.relaxedAt;
      if (elapsed < session.drowsyAt)
        return session.startedAt + session.drowsyAt;
      if (elapsed < session.sleepingAt)
        return session.startedAt + session.sleepingAt;
      if (at < recoveryUntil)
        return Math.min(recoveryUntil, session.startedAt + session.wakeAt);
      if (elapsed < session.wakeAt) return session.startedAt + session.wakeAt;
      return Infinity;
    }

    function baseScene() {
      if (depth === "drowsy") return scenes.drowsy;
      if (depth === "sleeping") return scenes.sleeping;
      return scenes.idle;
    }

    function selectFragment() {
      const at = now();
      const recent = new Set(recentFragments.slice(-3));
      const supportsEnergy = (fragment) =>
        fragment.energy !== "high" ||
        (energyBudget >= 3 && previousEnergy !== "high");
      const cooled = (fragment) =>
        at - (fragmentLastAt.get(fragment.name) ?? -Infinity) >=
        fragment.cooldown;
      const phaseCandidates = fragments.filter(
        (fragment) =>
          fragment.phases.includes(depth) &&
          cooled(fragment) &&
          supportsEnergy(fragment),
      );
      let candidates = phaseCandidates.filter(
        (fragment) => !recent.has(fragment.name),
      );
      if (candidates.length === 0) {
        const previous = recentFragments.at(-1);
        candidates = phaseCandidates.filter(
          (fragment) => fragment.name !== previous,
        );
      }
      if (candidates.length === 0) return null;
      const total = candidates.reduce(
        (sum, fragment) => sum + fragment.weight,
        0,
      );
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
      else if (selected.energy === "low")
        energyBudget = Math.min(3, energyBudget + 1);
      else energyBudget = Math.min(3, energyBudget + 0.5);
      previousEnergy = selected.energy;
      return selected;
    }

    function interval() {
      if (depth === "relaxed") return randomDelay([8000, 14_000]);
      if (depth === "drowsy") return randomDelay([10_000, 18_000]);
      if (depth === "sleeping") return randomDelay([18_000, 30_000]);
      return randomDelay([5000, 9000]);
    }

    function startNaturalWake() {
      const direction = chooseDirection("natural-wake");
      const delighted = random() < 0.15;
      reset(now());
      phase = "natural-wake";
      const token = ++generation;
      timeline.play(
        "idle",
        [
          {
            scene: withDetails(scenes.stretching, { direction }),
            duration: STRETCHING_SCENE_MS,
          },
          delighted
            ? {
                scene: scenes.quickHappy,
                duration: QUICK_HAPPY_SCENE_MS,
                wink: true,
              }
            : { scene: scenes.happy, duration: HAPPY_SCENE_MS },
        ],
        {
          onComplete() {
            if (generation === token && phase === "natural-wake") start();
          },
        },
      );
    }

    function start() {
      if (!session) reset();
      if (now() - session.startedAt >= session.wakeAt) {
        startNaturalWake();
        return;
      }
      const token = ++generation;
      phase = "idle";
      syncDepth();
      let delay = interval();
      if (quietUntil > now()) delay = Math.max(delay, quietUntil - now());
      const boundary = nextBoundary();
      delay = Math.min(delay, boundary - now());
      const previousDepth = depth;
      timeline.play("idle", [{ scene: baseScene(), duration: delay }], {
        onComplete() {
          if (generation !== token || phase !== "idle") return;
          syncDepth();
          if (depth !== previousDepth || now() >= boundary) {
            start();
            return;
          }
          const fragment = selectFragment();
          if (!fragment) {
            start();
            return;
          }
          phase = "fragment";
          const fragmentToken = ++generation;
          const wasHigh = fragment.energy === "high";
          timeline.play("idle", fragment.build(), {
            onComplete() {
              if (generation !== fragmentToken || phase !== "fragment") return;
              if (wasHigh) quietUntil = now() + randomDelay([20_000, 30_000]);
              start();
            },
          });
        },
      });
    }

    function stop() {
      phase = "stopped";
      generation += 1;
      timeline.cancel("idle");
    }

    function leave() {
      const currentDepth = syncDepth();
      stop();
      session = null;
      recoveryUntil = 0;
      quietUntil = 0;
      pokeTimes = [];
      return currentDepth === "drowsy" || currentDepth === "sleeping";
    }

    function hover() {
      if (
        (phase !== "idle" && phase !== "fragment") ||
        now() - lastHoverAt < 45_000
      )
        return false;
      syncDepth();
      if (depth !== "awake" && depth !== "relaxed") return false;
      lastHoverAt = now();
      const steps = [
        { scene: scenes.curious, duration: 500 },
        { scene: scenes.front, duration: 1300 },
      ];
      if (random() < 0.18)
        steps.push({ scene: scenes.quickHappy, duration: 700, wink: true });
      phase = "fragment";
      const token = ++generation;
      timeline.play("idle", steps, {
        onComplete() {
          if (generation === token && phase === "fragment") start();
        },
      });
      return true;
    }

    function recordPoke() {
      const cutoff = now() - 25_000;
      pokeTimes = pokeTimes.filter((at) => at >= cutoff);
      pokeTimes.push(now());
      if (pokeTimes.length < 3) return false;
      pokeTimes = [];
      return true;
    }

    function recoverFromSleep() {
      recoveryUntil = now() + randomDelay([20_000, 40_000]);
    }

    return Object.freeze({
      chooseDirection,
      depthAt,
      hover,
      leave,
      recordPoke,
      recoverFromSleep,
      reset,
      start,
      stop,
    });
  }

  g.O_PET_IDLE = Object.freeze({ create });
})(globalThis[Symbol.for("o-pet.renderer")]);
