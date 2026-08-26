/* Agent 活动行为。只把一个活动展开为可取消的动画时间线。 */
(function (g) {
  function create(options) {
    const { now, random, scenes, timeline } = options;
    const lastAccent = new Map();
    let activity = null;
    let activityAt = 0;
    let lastProgressAt = -Infinity;
    let generation = 0;

    const randomDelay = ([minimum, maximum]) =>
      minimum + Math.floor(random() * (maximum - minimum + 1));

    function chooseAccent(activityName, candidates) {
      const previous = lastAccent.get(activityName);
      const available =
        candidates.length > 1
          ? candidates.filter((candidate) => candidate.name !== previous)
          : candidates;
      const total = available.reduce(
        (sum, candidate) => sum + candidate.weight,
        0,
      );
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

    function stillIn(expected, token) {
      return activity === expected && generation === token;
    }

    function repeat(expected, token) {
      return () => {
        if (stillIn(expected, token)) run(expected, token);
      };
    }

    function runThinking(token) {
      const accent = chooseAccent("thinking", [
        {
          name: "humming",
          scene: scenes.humming,
          weight: 0.72,
          duration: [6000, 9000],
        },
        {
          name: "deep",
          scene: scenes.deepThinking,
          weight: 0.18,
          duration: [3500, 5500],
        },
        {
          name: "radar",
          scene: scenes.radar,
          weight: 0.1,
          duration: [3200, 4800],
        },
      ]);
      timeline.play(
        "activity",
        [
          { scene: scenes.thinking, duration: randomDelay([3000, 6000]) },
          { scene: accent.scene, duration: randomDelay(accent.duration) },
        ],
        { onComplete: repeat("thinking", token) },
      );
    }

    function runSearching(token) {
      const accent = chooseAccent("searching", [
        {
          name: "curious",
          scene: scenes.curious,
          weight: 0.45,
          duration: [1400, 2400],
        },
        {
          name: "radar",
          scene: scenes.radar,
          weight: 0.35,
          duration: [2500, 4000],
        },
        {
          name: "thinking",
          scene: scenes.deepThinking,
          weight: 0.2,
          duration: [1800, 3000],
        },
      ]);
      timeline.play(
        "activity",
        [
          { scene: scenes.searching, duration: randomDelay([3500, 6500]) },
          { scene: accent.scene, duration: randomDelay(accent.duration) },
        ],
        { onComplete: repeat("searching", token) },
      );
    }

    function runTerminal(token, initial) {
      const steps = [];
      if (initial)
        steps.push({
          scene: scenes.terminalTyping,
          duration: randomDelay([650, 1100]),
        });
      steps.push({
        scene: scenes.loading,
        duration: randomDelay([4500, 7000]),
      });
      timeline.play("activity", steps, {
        onComplete() {
          if (!stillIn("terminal", token)) return;
          const elapsed = now() - activityAt;
          const hasRecentOutput = now() - lastProgressAt < 5000;
          if (!hasRecentOutput && elapsed >= 20_000 && random() < 0.4) {
            timeline.play(
              "activity",
              [{ scene: scenes.bored, duration: randomDelay([1400, 2400]) }],
              {
                onComplete: () => {
                  if (stillIn("terminal", token)) runTerminal(token, false);
                },
              },
            );
          } else {
            runTerminal(token, false);
          }
        },
      });
    }

    function runApproval(token, initial) {
      const waiting =
        now() - activityAt >= 45_000 ? scenes.bored : scenes.listening;
      timeline.play(
        "activity",
        initial
          ? [{ scene: scenes.alerting, duration: 1600 }]
          : [
              { scene: waiting, duration: randomDelay([15_000, 25_000]) },
              { scene: scenes.notifying, duration: 900 },
            ],
        {
          onComplete() {
            if (stillIn("awaiting_approval", token)) runApproval(token, false);
          },
        },
      );
    }

    function run(name, token) {
      if (!stillIn(name, token)) return;
      switch (name) {
        case "thinking":
          runThinking(token);
          break;
        case "searching":
          runSearching(token);
          break;
        case "coding":
          timeline.play(
            "activity",
            [
              { scene: scenes.coding, duration: randomDelay([10_000, 16_000]) },
              {
                scene: scenes.reviewing,
                duration: randomDelay([2200, 3200]),
                spin: { turns: 1 },
              },
            ],
            { onComplete: repeat("coding", token) },
          );
          break;
        case "terminal":
          runTerminal(token, true);
          break;
        case "receiving":
          timeline.play(
            "activity",
            [
              { scene: scenes.receiving, duration: randomDelay([5000, 8000]) },
              { scene: scenes.curious, duration: randomDelay([1200, 2200]) },
            ],
            { onComplete: repeat("receiving", token) },
          );
          break;
        case "consulting":
          timeline.play(
            "activity",
            [
              { scene: scenes.consulting, duration: randomDelay([4000, 6500]) },
              {
                scene: scenes.deepThinking,
                duration: randomDelay([1800, 3000]),
              },
            ],
            { onComplete: repeat("consulting", token) },
          );
          break;
        case "tooling":
          timeline.play(
            "activity",
            [
              { scene: scenes.tooling, duration: randomDelay([4500, 7000]) },
              { scene: scenes.loading, duration: randomDelay([3000, 5000]) },
            ],
            { onComplete: repeat("tooling", token) },
          );
          break;
        case "replying":
          timeline.play(
            "activity",
            [
              { scene: scenes.replying, duration: randomDelay([6000, 10_000]) },
              { scene: scenes.listening, duration: randomDelay([700, 1200]) },
            ],
            { onComplete: repeat("replying", token) },
          );
          break;
        case "awaiting_approval":
          runApproval(token, true);
          break;
      }
    }

    function start(name, startedAt) {
      activity = name;
      activityAt = startedAt;
      const token = ++generation;
      run(name, token);
    }

    function progress() {
      lastProgressAt = now();
    }

    function resetProgress() {
      lastProgressAt = -Infinity;
    }

    function stop() {
      activity = null;
      generation += 1;
      timeline.cancel("activity");
    }

    return Object.freeze({ progress, resetProgress, start, stop });
  }

  g.O_PET_ACTIVITIES = Object.freeze({ create });
})(window);
