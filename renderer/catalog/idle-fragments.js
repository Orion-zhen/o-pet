// @ts-check
/* 空闲片段目录。每个片段只声明选择元数据和有限步骤链。 */
import * as steps from "./timeline-steps.js";

const HAPPY_MS = 1400;
const PLAYFUL_MS = 3000;
const PROUD_MS = 2200;
const SEARCHING_MS = 3500;
const STRETCHING_MS = 3500;

/**
 * @typedef {"low" | "medium" | "high"} IdleEnergy
 * @typedef {{ name: string, phases: readonly import("../types.js").IdleDepth[], energy: IdleEnergy, weight: number, cooldown: number, build: () => readonly import("../types.js").TimelineStep[] }} IdleFragment
 * @param {{ chooseDirection: (key: string) => number, presets: import("../types.js").PresetCatalog, random: () => number, randomDelay: (range: readonly [number, number]) => number, scenes: typeof import("./presets.js").scenes }} options
 * @returns {readonly IdleFragment[]}
 */
function create(options) {
  const { chooseDirection, presets, random, randomDelay, scenes } = options;
  /** @param {import("../types.js").Preset} base @param {import("../types.js").SceneDetails} details */
  const detailed = (base, details) => presets.withDetails(base, details);

  /** @type {IdleFragment[]} */
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
        return steps.sequence(
          steps.scene(detailed(scenes.gazeListening, { direction }), 250),
          steps.scene(detailed(scenes.listening, { direction }), 450),
          steps.scene(detailed(scenes.curious, { direction }), 900),
          found
            ? steps.scene(detailed(scenes.playful, { direction }), PLAYFUL_MS, {
                events: [steps.pounce(0.4, direction)],
              })
            : steps.scene(detailed(scenes.idle, { direction }), 700),
          ...(found ? [steps.scene(scenes.happy, HAPPY_MS)] : []),
        );
      },
    },
    {
      name: "stash-light",
      phases: ["awake", "relaxed"],
      energy: "medium",
      weight: 1.8,
      cooldown: 60_000,
      build() {
        const direction = chooseDirection("stash-light");
        return steps.sequence(
          steps.scene(detailed(scenes.gazeLight, { direction }), 350),
          steps.scene(
            detailed(scenes.stashingLight, { direction }),
            1720,
          ),
          steps.scene(
            detailed(scenes.stashedLightHappy, { direction }),
            900,
          ),
        );
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
        return steps.sequence(
          steps.scene(detailed(scenes.gazeSearching, { direction }), 250),
          steps.scene(
            detailed(scenes.searching, { direction }),
            SEARCHING_MS,
          ),
          steps.scene(detailed(scenes.searching, { direction: -direction }), 650),
          steps.scene(scenes.proud, PROUD_MS),
        );
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
        return steps.sequence(
          steps.scene(detailed(scenes.gazeCurious, { direction }), 250),
          steps.scene(detailed(scenes.curious, { direction }), 400),
          steps.scene(detailed(scenes.playful, { direction }), PLAYFUL_MS),
          steps.scene(detailed(scenes.jumping, { direction }), 1050, {
            events: [steps.pounce(1, direction)],
          }),
          ...(success
            ? [steps.scene(scenes.happy, HAPPY_MS)]
            : [
                steps.scene(scenes.surprised, 600),
                steps.scene(scenes.shy, 900),
              ]),
        );
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
        return steps.sequence(
          steps.scene(scenes.playful, PLAYFUL_MS),
          steps.scene(scenes.jumping, 1800, { events: [steps.hop()] }),
          ...(failed
            ? [
                steps.scene(scenes.surprised, 650),
                steps.scene(scenes.shy, 800),
              ]
            : [steps.scene(scenes.happy, HAPPY_MS)]),
        );
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
            ? [steps.scene(scenes.proud, PROUD_MS)]
            : result < 0.96
              ? [steps.scene(scenes.shy, 1300)]
              : [
                  steps.scene(scenes.quickHappy, 900, {
                    events: [steps.wink(), steps.pounce(0.35, direction)],
                  }),
                ];
        return steps.sequence(
          steps.scene(
            detailed(scenes.playful, { direction: -direction }),
            PLAYFUL_MS,
          ),
          steps.scene(detailed(scenes.playful, { direction }), PLAYFUL_MS),
          ...ending,
        );
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
        return steps.sequence(
          steps.scene(
            detailed(scenes.stretching, { direction }),
            STRETCHING_MS,
          ),
          steps.scene(scenes.happy, HAPPY_MS),
        );
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
        return steps.sequence(
          steps.scene(detailed(scenes.listening, { direction }), 1200),
          steps.scene(scenes.idle, 900),
        );
      },
    },
    {
      name: "self-entertain",
      phases: ["relaxed"],
      energy: "medium",
      weight: 2.2,
      cooldown: 40_000,
      build: () =>
        steps.sequence(
          steps.scene(scenes.bored, 1600),
          steps.scene(scenes.curious, 900),
          steps.scene(scenes.playful, PLAYFUL_MS),
        ),
    },
    {
      name: "sleepy-nod",
      phases: ["drowsy"],
      energy: "low",
      weight: 5,
      cooldown: 20_000,
      build: () =>
        steps.sequence(
          steps.scene(scenes.drowsy, 2200),
          steps.scene(scenes.surprised, 600),
          steps.scene(scenes.drowsy, 900),
        ),
    },
    {
      name: "resist-sleep",
      phases: ["drowsy"],
      energy: "medium",
      weight: 2.2,
      cooldown: 40_000,
      build() {
        const direction = chooseDirection("sleepy-stretch");
        return steps.sequence(
          steps.scene(
            detailed(scenes.stretching, { direction }),
            STRETCHING_MS,
          ),
          steps.scene(scenes.happy, HAPPY_MS),
          steps.scene(scenes.drowsy, 900),
        );
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
        return steps.sequence(
          steps.scene(detailed(scenes.sleepyCurious, { direction }), 1600),
          steps.scene(scenes.drowsy, 1000),
        );
      },
    },
    {
      name: "sleepy-play",
      phases: ["drowsy"],
      energy: "medium",
      weight: 1,
      cooldown: 70_000,
      build: () =>
        steps.sequence(
          steps.scene(scenes.playful, PLAYFUL_MS),
          steps.scene(scenes.drowsy, 1300),
        ),
    },
    ...["float", "curl", "twitch"].map(
      (variant) =>
        /** @type {IdleFragment} */ ({
          name: `dream-${variant}`,
          phases: ["sleeping"],
          energy: "low",
          weight: 1,
          cooldown: 35_000,
          build() {
            return steps.sequence(
              steps.scene(
                detailed(scenes.dreaming, {
                  direction:
                    variant === "curl"
                      ? chooseDirection("dream-curl")
                      : 0,
                  variant,
                }),
                randomDelay([6000, 10_000]),
              ),
            );
          },
        }),
    ),
  ];
  return Object.freeze(fragments.map((fragment) => Object.freeze(fragment)));
}

export { create };
