import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const hostSource = readFileSync(new URL("../renderer/host.js", import.meta.url), "utf8");
const particlesSource = readFileSync(new URL("../renderer/grok/particles.js", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../renderer/grok/actions.js", import.meta.url), "utf8");
const characterSource = readFileSync(new URL("../renderer/grok/character.js", import.meta.url), "utf8");
const choreographySource = readFileSync(new URL("../renderer/grok/choreography.js", import.meta.url), "utf8");
const effectsSource = readFileSync(new URL("../renderer/grok/effects.js", import.meta.url), "utf8");
const eyesSource = readFileSync(new URL("../renderer/grok/eyes.js", import.meta.url), "utf8");
const renderSource = readFileSync(new URL("../renderer/grok/render.js", import.meta.url), "utf8");
const geometrySource = readFileSync(new URL("../renderer/grok/geometry-data.js", import.meta.url), "utf8");
const geometryEngineSource = readFileSync(new URL("../renderer/grok/geometry.js", import.meta.url), "utf8");
const mathSource = readFileSync(new URL("../renderer/grok/math.js", import.meta.url), "utf8");
const motionSource = readFileSync(new URL("../renderer/grok/motion.js", import.meta.url), "utf8");
const expressionSource = readFileSync(new URL("../renderer/grok/expression.js", import.meta.url), "utf8");
const gazeSource = readFileSync(new URL("../renderer/grok/gaze.js", import.meta.url), "utf8");
const presetsSource = readFileSync(new URL("../renderer/grok/presets.js", import.meta.url), "utf8");
const sequencesSource = readFileSync(new URL("../renderer/grok/sequences.js", import.meta.url), "utf8");
const tablesSource = readFileSync(new URL("../renderer/grok/tables.js", import.meta.url), "utf8");

type EventListener = (event: RendererEvent) => void;
interface RendererEvent {
	button?: number;
	buttons?: number;
	pointerId?: number;
	clientX?: number;
	clientY?: number;
}

class EventTargetStub {
	readonly listeners = new Map<string, Set<EventListener>>();

	addEventListener(type: string, listener: EventListener): void {
		const listeners = this.listeners.get(type) ?? new Set<EventListener>();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: EventListener): void {
		this.listeners.get(type)?.delete(listener);
	}

	dispatch(type: string, event: RendererEvent = {}): void {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}
}

class BodyStub extends EventTargetStub {
	readonly classes = new Set<string>();
	readonly capturedPointers: number[] = [];
	readonly classList = {
		add: (name: string): void => void this.classes.add(name),
		remove: (name: string): void => void this.classes.delete(name),
	};

	setPointerCapture(pointerId: number): void {
		this.capturedPointers.push(pointerId);
	}
}

class DocumentStub extends EventTargetStub {
	hidden = false;
	readonly body = new BodyStub();
}

class MotionQueryStub extends EventTargetStub {
	matches = false;
}

class ClockStub {
	now = 0;
	#nextId = 1;
	readonly #timers = new Map<number, { callback: () => void; due: number }>();

	setTimeout(callback: () => void, delay: number): number {
		const id = this.#nextId++;
		this.#timers.set(id, { callback, due: this.now + delay });
		return id;
	}

	clearTimeout(id: number): void {
		this.#timers.delete(id);
	}

	requestAnimationFrame(callback: () => void): number {
		return this.setTimeout(callback, 16);
	}

	cancelAnimationFrame(id: number): void {
		this.clearTimeout(id);
	}

	advance(milliseconds: number): void {
		const target = this.now + milliseconds;
		for (;;) {
			const next = [...this.#timers.entries()]
				.filter(([, timer]) => timer.due <= target)
				.sort((left, right) => left[1].due - right[1].due)[0];
			if (!next) break;
			const [id, timer] = next;
			this.#timers.delete(id);
			this.now = timer.due;
			timer.callback();
		}
		this.now = target;
	}
}

interface CharacterOptions {
	color: string;
	followPointer: boolean;
	mode: string;
	shape: string;
	state: string;
}

interface CharacterScene {
	pose: string;
	expression: string;
	effect: string | null;
	gaze: string;
	direction?: number;
	variant?: string;
}

class CharacterStub {
	readonly scenes: CharacterScene[];
	readonly shapes: string[] = [];
	readonly colors: Array<[string, string | undefined]> = [];
	readonly bodyColors: string[] = [];
	readonly eyeColors: string[] = [];
	readonly paused: boolean[] = [];
	readonly reducedMotion: boolean[] = [];
	readonly followingPointer: boolean[] = [];
	colorId: string;
	destroyed = false;
	bounceCount = 0;
	pounceCount = 0;
	spinCount = 0;
	winkCount = 0;

	constructor(_svg: unknown, options: CharacterOptions) {
		this.scenes = [{
			pose: options.state,
			expression: options.state,
			effect: options.state,
			gaze: options.state,
		}];
		this.colorId = options.color;
	}

	setScene(scene: CharacterScene): void {
		this.scenes.push(scene);
	}

	setPreset(value: unknown): void {
		const detailed = value as {
			preset?: { channels: Record<string, { id: string | null }>; effectId?: string | null };
			channels?: Record<string, { id: string | null }>;
			effectId?: string | null;
			direction?: number;
			variant?: string;
		};
		const preset = detailed.preset ?? detailed;
		const channels = preset.channels;
		if (channels === undefined) throw new Error("无效动画预设");
		this.setScene({
			pose: channels.motion?.id ?? "idle",
			expression: channels.expression?.id ?? "idle",
			effect: preset.effectId ?? null,
			gaze: channels.gaze?.id ?? "idle",
			...(detailed.direction === undefined ? {} : { direction: detailed.direction }),
			...(detailed.variant === undefined ? {} : { variant: detailed.variant }),
		});
	}

	setState(state: string): void {
		this.setScene({ pose: state, expression: state, effect: state, gaze: state });
	}

	winkOnce(): void {
		this.winkCount += 1;
	}

	spinOnce(): void {
		this.spinCount += 1;
	}

	bounceOnce(): void {
		this.bounceCount += 1;
	}

	pounceOnce(): void {
		this.pounceCount += 1;
	}

	setGazeTarget(_target: { x: number; y: number } | null): void {}

	setShape(shape: string): void {
		this.shapes.push(shape);
	}

	setColor(color: string, scheme?: string): void {
		this.colorId = color;
		this.colors.push([color, scheme]);
	}

	setInk(color: string): void {
		this.bodyColors.push(color);
	}

	setEyeColor(color: string): void {
		this.eyeColors.push(color);
	}

	setFollowPointer(value: boolean): void {
		this.followingPointer.push(value);
	}

	setReduceMotion(value: boolean): void {
		this.reducedMotion.push(value);
	}

	setPaused(value: boolean): void {
		this.paused.push(value);
	}

	destroy(): void {
		this.destroyed = true;
	}
}

interface RendererUpdate {
	activity: string;
	cue?: string;
}

interface RendererApi {
	destroy(): void;
	setPreferences(preferences: unknown): boolean;
	update(update: RendererUpdate): boolean;
}

type DragMessage = { phase: "start" | "end" } | { phase: "move"; dx: number; dy: number };

interface RendererFactory {
	create(options: {
		clock: ClockStub;
		document: DocumentStub;
		frameClock: ClockStub;
		motionQuery: MotionQueryStub;
		now: () => number;
		postDrag: (message: DragMessage) => void;
		random: () => number;
		svg: object;
	}): RendererApi;
}

function createHarness(initiallyHidden = false, random = (): number => 0): {
	api: RendererApi;
	character: CharacterStub;
	clock: ClockStub;
	document: DocumentStub;
	drags: DragMessage[];
	highEnergyAt: number[];
	motion: MotionQueryStub;
} {
	const clock = new ClockStub();
	const highEnergyAt: number[] = [];
	const instances: CharacterStub[] = [];
	class HarnessCharacter extends CharacterStub {
		constructor(svg: unknown, options: CharacterOptions) {
			super(svg, options);
			instances.push(this);
		}

		override spinOnce(): void {
			super.spinOnce();
			highEnergyAt.push(clock.now);
		}

		override bounceOnce(): void {
			super.bounceOnce();
			highEnergyAt.push(clock.now);
		}
	}
	const windowStub: Record<string, unknown> = {
		GROK_GEO: {
			palette: { black: {}, blue: {} },
			shapes: { blob: {}, cloud: {} },
		},
		GrokCharacter: HarnessCharacter,
	};
	windowStub.window = windowStub;
	vm.runInNewContext(presetsSource, windowStub);
	vm.runInNewContext(sequencesSource, windowStub);
	vm.runInNewContext(hostSource, windowStub);
	const factory = windowStub.OPetRenderer as RendererFactory;
	const document = new DocumentStub();
	document.hidden = initiallyHidden;
	const motion = new MotionQueryStub();
	const drags: DragMessage[] = [];
	const api = factory.create({
		clock,
		document,
		frameClock: clock,
		motionQuery: motion,
		now: () => clock.now,
		postDrag: (message) => drags.push(message),
		random,
		svg: {},
	});
	const character = instances[0];
	if (character === undefined) throw new Error("渲染器未创建角色");
	return { api, character, clock, document, drags, highEnergyAt, motion };
}

function latest(character: CharacterStub): CharacterScene {
	const current = character.scenes.at(-1);
	if (current === undefined) throw new Error("角色没有动画场景");
	return current;
}

class SvgElementStub {
	readonly attributes = new Map<string, string>();
	readonly children: SvgElementStub[] = [];
	readonly style: Record<string, unknown> = {
		setProperty: (name: string, value: string): void => {
			this.style[name] = value;
		},
	};
	parent: SvgElementStub | undefined;
	removed = false;
	innerHTML = "";
	id = "";

	constructor(
		readonly tag: string,
		private readonly onRemove: (element: SvgElementStub) => void = () => {},
	) {}

	appendChild(child: SvgElementStub): SvgElementStub {
		child.parent = this;
		this.children.push(child);
		return child;
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
		if (name === "id") this.id = value;
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	removeAttribute(name: string): void {
		this.attributes.delete(name);
	}

	getBoundingClientRect(): { height: number; left: number; top: number; width: number } {
		return { height: 190, left: 0, top: 0, width: 190 };
	}

	remove(): void {
		if (this.removed) return;
		this.removed = true;
		if (this.parent !== undefined) {
			const index = this.parent.children.indexOf(this);
			if (index >= 0) this.parent.children.splice(index, 1);
		}
		this.onRemove(this);
	}
}

interface ParticleController {
	update(now: number, dt: number, options: {
		sizeScale: number;
		spinAngle: number;
		sustainBelts: boolean;
		wideStyle: boolean;
	}): void;
}

function createParticleHarness(): {
	elements: SvgElementStub[];
	particles: ParticleController;
	removedTrails: () => number;
} {
	const elements: SvgElementStub[] = [];
	let removedTrails = 0;
	const createElement = (tag: string): SvgElementStub => {
		const element = new SvgElementStub(tag, (removed) => {
			if (removed.attributes.has("data-trail")) removedTrails += 1;
		});
		elements.push(element);
		return element;
	};
	const back = createElement("g");
	const front = createElement("g");
	const windowStub: {
		GROK_PARTICLES?: { create(options: unknown): ParticleController };
		GROK_GEO: { Re: number };
	} = { GROK_GEO: { Re: 114.2705 } };
	const deterministicMath = Object.create(Math) as Math;
	deterministicMath.random = () => 0.5;
	const context = {
		document: { createElementNS: (_namespace: string, tag: string) => createElement(tag) },
		matchMedia: () => ({ matches: false }),
		Math: deterministicMath,
		window: windowStub,
	};
	vm.runInNewContext(mathSource, context);
	vm.runInNewContext(geometryEngineSource, context);
	vm.runInNewContext(particlesSource, context);
	const factory = windowStub.GROK_PARTICLES;
	if (factory === undefined) throw new Error("粒子渲染器未加载");
	return {
		elements,
		particles: factory.create({ back, front, getRadius: () => 52, idPrefix: "test-" }),
		removedTrails: () => removedTrails,
	};
}

type AnimationFrameCallback = (time: number) => void;

interface VisualPreset {
	channels: Record<string, { id: string | null }>;
	effectId?: string | null;
}

interface VisualCharacter {
	setPreset(preset: unknown): void;
	setShape(shape: string): void;
	winkOnce(eye?: number): void;
	spinOnce(turns?: number, direction?: number): void;
	bounceOnce(): void;
	pounceOnce(direction?: number, strength?: number): void;
	destroy(): void;
}

class VisualWindowStub extends EventTargetStub {
	GrokCharacter?: new (svg: SvgElementStub, options: Record<string, unknown>) => VisualCharacter;
	GROK_PRESETS?: {
		scenes: Record<string, VisualPreset>;
		withDetails(preset: VisualPreset, details: Record<string, unknown>): unknown;
	};
}

function serializeSvg(element: SvgElementStub): unknown {
	return {
		tag: element.tag,
		attributes: Object.fromEntries([...element.attributes].sort(([left], [right]) => left.localeCompare(right))),
		style: Object.fromEntries(Object.entries(element.style)
			.filter(([, value]) => typeof value !== "function" && value !== "" && value !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))),
		children: element.children.map(serializeSvg),
	};
}

function svgHash(svg: SvgElementStub): string {
	return createHash("sha256").update(JSON.stringify(serializeSvg(svg))).digest("hex").slice(0, 16);
}

function createVisualHarness(): {
	character: VisualCharacter;
	frame(time: number): void;
	presets: NonNullable<VisualWindowStub["GROK_PRESETS"]>;
	setTime(time: number): void;
	svg: SvgElementStub;
} {
	let now = 0;
	let nextFrameId = 1;
	const frames = new Map<number, AnimationFrameCallback>();
	const documentElement = new EventTargetStub();
	const documentStub = {
		createElementNS: (_namespace: string, tag: string): SvgElementStub => new SvgElementStub(tag),
		documentElement,
	};
	const deterministicMath = Object.create(Math) as Math;
	deterministicMath.random = () => 0.5;
	const windowStub = new VisualWindowStub();
	const requestAnimationFrame = (callback: AnimationFrameCallback): number => {
		const id = nextFrameId++;
		frames.set(id, callback);
		return id;
	};
	const cancelAnimationFrame = (id: number): void => void frames.delete(id);
	const context = {
		cancelAnimationFrame,
		document: documentStub,
		matchMedia: () => ({ matches: false }),
		Math: deterministicMath,
		performance: { now: (): number => now },
		requestAnimationFrame,
		window: windowStub,
	};
	Object.assign(windowStub, {
		cancelAnimationFrame,
		document: documentStub,
		matchMedia: context.matchMedia,
		performance: context.performance,
		requestAnimationFrame,
		window: windowStub,
	});
	for (const source of [
		geometrySource,
		mathSource,
		geometryEngineSource,
		tablesSource,
		presetsSource,
		sequencesSource,
		motionSource,
		expressionSource,
		gazeSource,
		choreographySource,
		actionsSource,
		particlesSource,
		effectsSource,
		eyesSource,
		renderSource,
		characterSource,
	]) vm.runInNewContext(source, context);

	const Character = windowStub.GrokCharacter;
	const presets = windowStub.GROK_PRESETS;
	if (Character === undefined || presets === undefined) throw new Error("完整动画引擎未加载");
	const svg = new SvgElementStub("svg");
	const character = new Character(svg, {
		color: "black",
		followPointer: false,
		mode: "hold",
		shape: "blob",
		state: "spawning",
	});
	return {
		character,
		frame(time) {
			now = time;
			const callbacks = [...frames.values()];
			frames.clear();
			for (const callback of callbacks) callback(time);
		},
		presets,
		setTime(time) {
			now = time;
		},
		svg,
	};
}

describe("o-pet Grok 渲染器", () => {
	it("内嵌全部眼睛、身形和配色数据", () => {
		const windowStub: Record<string, unknown> = {};
		windowStub.window = windowStub;
		vm.runInNewContext(geometrySource, windowStub);
		vm.runInNewContext(mathSource, windowStub);
		vm.runInNewContext(geometryEngineSource, windowStub);
		vm.runInNewContext(tablesSource, windowStub);
		const geometry = windowStub.GROK_GEO as {
			eyes: unknown[];
			palette: Record<string, unknown>;
			shapes: Record<string, unknown>;
		};
		const geometryEngine = windowStub.GROK_GEOMETRY as {
			shapeModel(name: string): { ring: number[][] };
		};
		const tables = windowStub.GROK_TABLES as {
			BLINK_MS: Record<string, [number, number] | null>;
			EYE_PLAYLIST: Record<string, number[]>;
			GROUPS: Array<{ states: string[] }>;
		};

		const states = tables.GROUPS.flatMap((group) => group.states);
		expect(states).toHaveLength(44);
		expect(states).toEqual(expect.arrayContaining([
			"startled", "stretching", "dreaming", "quizzical", "front",
		]));
		expect(states).not.toContain("progress");
		expect(tables.EYE_PLAYLIST.winking).toEqual([1]);
		expect(tables.BLINK_MS.winking).toBeNull();
		expect(geometry.eyes).toHaveLength(25);
		expect(Object.keys(geometry.shapes)).toEqual([
			"blob", "pebble", "bean", "egg", "squircle", "tablet", "capsule", "cylinder", "hex",
			"gem", "crystal", "wedge", "shield", "dome", "arch", "cloud", "teardrop", "leaf",
		]);
		expect(Object.keys(geometry.palette)).toEqual([
			"black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray",
		]);
		const ringSignature = Object.keys(geometry.shapes).map((name) => [
			name,
			geometryEngine.shapeModel(name).ring.map((point) => point.map((value) => value.toFixed(9))),
		]);
		expect(createHash("sha256").update(JSON.stringify(ringSignature)).digest("hex")).toBe(
			"bbe70f8567463f0b904727f9b4a8631438598a1e345525b3d8a3875efae788ed",
		);
	});

	it("将场景拆为固定且互不重叠的控制通道", () => {
		const windowStub: Record<string, unknown> = {};
		windowStub.window = windowStub;
		vm.runInNewContext(presetsSource, windowStub);
		vm.runInNewContext(sequencesSource, windowStub);
		const presets = windowStub.GROK_PRESETS as {
			CHANNELS: string[];
			scenes: Record<string, VisualPreset>;
		};
		const sequences = windowStub.GROK_SEQUENCES as {
			cues: Record<string, Array<{ preserveEffect?: boolean }>>;
		};
		const expectedChannels = [
			"motion", "face", "expression", "gaze", "form",
			"decoration", "particles", "camera", "badge",
		];
		expect(presets.CHANNELS).toEqual(expectedChannels);
		for (const preset of Object.values(presets.scenes)) {
			expect(Object.keys(preset.channels)).toEqual(expectedChannels);
		}
		expect(presets.scenes.coding?.channels).toMatchObject({
			motion: { id: "working" },
			expression: { id: "working" },
			form: { id: "pencil" },
			decoration: { id: "pencil" },
			particles: { id: null },
			camera: { id: "pencil" },
		});
		expect(presets.scenes.humming?.channels).toMatchObject({
			form: { id: null },
			decoration: { id: "hum-dots" },
			particles: { id: "wide-spin-belts" },
			camera: { id: null },
		});
		expect(sequences.cues.error_repeated?.[0]?.preserveEffect).toBe(true);
	});

	it("关键 SVG 帧与重构前的视觉基线一致", () => {
		const harness = createVisualHarness();
		const hashes: Array<[string, string]> = [];
		const record = (label: string, time?: number): void => {
			if (time !== undefined) harness.frame(time);
			hashes.push([label, svgHash(harness.svg)]);
		};
		const enter = (name: string, time: number, details?: Record<string, unknown>): void => {
			const preset = harness.presets.scenes[name];
			if (preset === undefined) throw new Error(`缺少场景 ${name}`);
			harness.setTime(time);
			harness.character.setPreset(
				details === undefined ? preset : harness.presets.withDetails(preset, details),
			);
		};

		record("spawning@0");
		record("spawning@16", 16);
		enter("coding", 2000);
		record("coding@2016", 2016);
		record("coding@2500", 2500);
		enter("loading", 5000);
		record("loading@5016", 5016);
		record("loading@5800", 5800);
		enter("receiving", 7000);
		record("receiving@7016", 7016);
		record("receiving@7800", 7800);
		enter("quizzical", 9000, { direction: 1 });
		record("quizzical@9016", 9016);
		record("quizzical@9900", 9900);
		harness.setTime(11_000);
		harness.character.setShape("cloud");
		record("cloud@11016", 11_016);
		record("cloud@11800", 11_800);
		harness.setTime(13_000);
		harness.character.spinOnce(2, -1);
		record("spin@13016", 13_016);
		record("spin@13700", 13_700);
		harness.setTime(15_000);
		harness.character.winkOnce(0);
		harness.character.pounceOnce(1, 0.7);
		record("wink-pounce@15016", 15_016);
		record("wink-pounce@15320", 15_320);
		harness.character.destroy();

		expect(hashes).toEqual([
			["spawning@0", "1955d3d2b713acdd"],
			["spawning@16", "7dfcb20a7f8b8f5e"],
			["coding@2016", "2553c4abddc648c0"],
			["coding@2500", "2774aa793d24956e"],
			["loading@5016", "4ceb4ac81639e87f"],
			["loading@5800", "450ee61df0cd5790"],
			["receiving@7016", "2bc241e7ae7f5034"],
			["receiving@7800", "cdc06df5d8b2e4ee"],
			["quizzical@9016", "06c80910b5024253"],
			["quizzical@9900", "63c2c48d9196134d"],
			["cloud@11016", "6c62a5c6c171ec6b"],
			["cloud@11800", "ef631bd7db84dce3"],
			["spin@13016", "e6e4e2ffce717860"],
			["spin@13700", "875d1dd18171029a"],
			["wink-pounce@15016", "a6f67525b95b8b27"],
			["wink-pounce@15320", "dd419c0427ef8a6c"],
		]);
	});

	it.each([
		["thinking", "thinking", null],
		["searching", "searching", null],
		["coding", "working", "writing"],
		["receiving", "working", "receiving"],
		["consulting", "thinking", "orbit"],
		["tooling", "working", "orbit"],
		["replying", "listening", "dictating"],
	] as const)("将 %s 活动组合为姿态和特效通道", (activity, pose, effect) => {
		const { api, character, clock } = createHarness();
		expect(api.update({ activity })).toBe(true);
		clock.advance(2000);
		expect(latest(character)).toMatchObject({ pose, effect });
	});

	it("空闲片段先转移视线，再让身体跟随", () => {
		const { character, clock } = createHarness();
		clock.advance(7000);
		expect(latest(character)).toMatchObject({
			pose: "idle",
			expression: "listening",
			gaze: "listening",
		});
		clock.advance(250);
		expect(latest(character).pose).toBe("listening");
	});

	it("最近空闲片段不会短时间重复", () => {
		const { character, clock } = createHarness();
		clock.advance(60_000);
		const storyStarts = character.scenes
			.filter((value) => value.pose === "idle" && ["listening", "searching", "curious"].includes(value.gaze))
			.map((value) => value.gaze);
		expect(storyStarts.slice(0, 3)).toEqual(["listening", "searching", "curious"]);
	});

	it("空闲阶段边界由每次会话的随机序列决定", () => {
		const early = createHarness(false, () => 0);
		const late = createHarness(false, () => 0.999);
		early.clock.advance(4 * 60_000);
		late.clock.advance(4 * 60_000);
		expect(early.character.scenes.some((value) => value.pose === "drowsy")).toBe(true);
		expect(late.character.scenes.some((value) => value.pose === "drowsy")).toBe(false);
	});

	it("高能量片段在清醒阶段保持低频", () => {
		const { clock, highEnergyAt } = createHarness(false, () => 0.999);
		clock.advance(150_000);
		expect(highEnergyAt).toHaveLength(2);
		const [first, second] = highEnergyAt;
		if (first === undefined || second === undefined) throw new Error("缺少高能量片段时间");
		expect(second - first).toBeGreaterThanOrEqual(20_000);
	});

	it("思考几秒后优先进入 humming，随后回到思考", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "thinking" });
		clock.advance(2000);
		expect(latest(character).pose).toBe("thinking");
		clock.advance(3000);
		expect(latest(character)).toMatchObject({ pose: "humming", effect: "humming" });
		clock.advance(6000);
		expect(latest(character).pose).toBe("thinking");
	});

	it("长时间书写后同步收起铅笔、抬头和条带旋转", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "coding" });
		clock.advance(2000);
		expect(latest(character).effect).toBe("writing");
		clock.advance(9999);
		expect(latest(character).effect).toBe("writing");
		expect(character.spinCount).toBe(0);
		clock.advance(1);
		expect(latest(character)).toMatchObject({ pose: "thinking", effect: null });
		expect(character.spinCount).toBe(1);
		clock.advance(2200);
		expect(latest(character).effect).toBe("writing");
	});

	it("终端先敲命令，随后持续显示等待动画", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "terminal" });
		clock.advance(2000);
		expect(latest(character)).toMatchObject({ pose: "working", effect: null });
		clock.advance(650);
		expect(latest(character).effect).toBe("loading");
		api.update({ activity: "terminal", cue: "progress" });
		expect(latest(character).effect).toBe("loading");
		clock.advance(2200);
		expect(latest(character).effect).toBe("loading");
	});

	it("长时间 loading 会销毁旧彩带并保持新彩带可见", () => {
		const { elements, particles, removedTrails } = createParticleHarness();
		let spinAngle = 0;
		for (let now = 0; now <= 12_000; now += 16) {
			const dt = 0.016;
			spinAngle += (now < 1_000 ? 7 : 3) * dt;
			particles.update(now, dt, {
				sizeScale: 1,
				spinAngle,
				sustainBelts: true,
				wideStyle: false,
			});
		}

		expect(removedTrails()).toBeGreaterThan(0);
		expect(elements.some((element) => (
			element.attributes.has("data-trail")
			&& !element.removed
			&& (element.attributes.get("d")?.length ?? 0) > 0
		))).toBe(true);
	});

	it("审批只短暂警示，随后安静等待用户", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "awaiting_approval" });
		expect(latest(character).pose).toBe("alerting");
		clock.advance(1600);
		expect(latest(character).pose).toBe("listening");
	});

	it("错误反应保留正在使用的工具特效", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "coding" });
		clock.advance(2000);
		api.update({ activity: "coding", cue: "error_repeated" });
		expect(latest(character)).toMatchObject({ pose: "confused", effect: "writing" });
		clock.advance(1200);
		expect(latest(character)).toMatchObject({ pose: "working", effect: "writing" });
	});

	it("简单任务完成时使用竖线眼并单眨一只眼", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "idle", cue: "completed_quick" });
		clock.advance(2000);
		expect(latest(character)).toMatchObject({ pose: "happy", expression: "winking" });
		expect(character.winkCount).toBe(1);
		clock.advance(900);
		expect(latest(character).pose).toBe("notifying");
	});

	it("审批通过仍使用普通 happy 眼神", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "thinking", cue: "approval_granted" });
		clock.advance(2000);
		expect(latest(character)).toMatchObject({ pose: "happy", expression: "happy" });
		expect(character.winkCount).toBe(0);
	});

	it("困难完成只播放 celebrate 和 notifying", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "idle", cue: "completed_hard" });
		clock.advance(2000);
		expect(latest(character).pose).toBe("celebrate");
		clock.advance(2500);
		expect(latest(character).pose).toBe("notifying");
		clock.advance(2500);
		expect(latest(character).pose).toBe("idle");
		expect(character.scenes.map((value) => value.pose)).not.toContain("laughing");
	});

	it("先完成回复发送动作，再播放完成反馈", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "replying" });
		clock.advance(2000);
		api.update({ activity: "replying", cue: "reply_sent" });
		api.update({ activity: "idle", cue: "completed_normal" });
		clock.advance(849);
		expect(latest(character).effect).toBe("sending");
		clock.advance(1);
		expect(latest(character).pose).toBe("proud");
	});

	it("快速工具切换只进入消抖后的最新活动", () => {
		const { api, character, clock } = createHarness();
		clock.advance(2000);
		api.update({ activity: "searching" });
		clock.advance(100);
		api.update({ activity: "coding" });
		clock.advance(349);
		expect(latest(character).pose).toBe("idle");
		clock.advance(1);
		expect(latest(character).effect).toBe("writing");
		expect(character.scenes.map((value) => value.pose)).not.toContain("searching");
	});

	it("隐藏页面时暂停场景计时，恢复后继续", () => {
		const { api, character, clock, document } = createHarness();
		api.update({ activity: "idle", cue: "completed_hard" });
		clock.advance(2000);
		document.hidden = true;
		document.dispatch("visibilitychange");
		clock.advance(10_000);
		expect(latest(character).pose).toBe("celebrate");
		document.hidden = false;
		document.dispatch("visibilitychange");
		clock.advance(2500);
		expect(latest(character).pose).toBe("notifying");
		expect(character.paused).toEqual([true, false]);
	});

	it("隐藏期间不推进空闲阶段", () => {
		const { character, clock, document } = createHarness();
		clock.advance(2000);
		document.hidden = true;
		document.dispatch("visibilitychange");
		clock.advance(4 * 60_000);
		document.hidden = false;
		document.dispatch("visibilitychange");
		expect(latest(character).pose).toBe("idle");
		clock.advance(4 * 60_000 - 2000 + 10_000);
		expect(latest(character).pose).toBe("drowsy");
	});

	it("隐藏期间收到的新活动从页面恢复时开始计时", () => {
		const { api, character, clock, document } = createHarness();
		clock.advance(2000);
		document.hidden = true;
		document.dispatch("visibilitychange");
		clock.advance(10 * 60_000);
		api.update({ activity: "thinking" });
		clock.advance(5 * 60_000);
		document.hidden = false;
		document.dispatch("visibilitychange");
		clock.advance(350);
		expect(latest(character).pose).toBe("thinking");
		expect(character.scenes.map((value) => value.pose)).not.toContain("waking");
	});

	it("应用受支持的身形、配色和动态偏好", () => {
		const { api, character, motion } = createHarness();
		expect(api.setPreferences({
			body_color: "#123456",
			color: "blue",
			eye_color: "#abcdef",
			followPointer: false,
			reduceMotion: true,
			scheme: "dark",
			shape: "cloud",
		})).toBe(true);
		expect(character.shapes).toEqual(["cloud"]);
		expect(character.colors).toEqual([["blue", undefined], ["blue", "dark"]]);
		expect(character.bodyColors).toEqual(["#123456"]);
		expect(character.eyeColors).toEqual(["#abcdef"]);
		expect(character.followingPointer).toEqual([false]);
		expect(character.reducedMotion.at(-1)).toBe(true);

		api.setPreferences({ reduceMotion: false });
		motion.matches = true;
		motion.dispatch("change");
		expect(character.reducedMotion.at(-1)).toBe(true);
	});

	it("拖动时临时播放 dragging，并按动画帧合并移动", () => {
		const { clock, character, document, drags } = createHarness();
		document.body.dispatch("pointerdown", { button: 0, pointerId: 4, clientX: 20, clientY: 30 });
		expect(latest(character).pose).toBe("dragging");
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 4, clientX: 21, clientY: 29 });
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 4, clientX: 27, clientY: 25 });
		expect(drags).toEqual([{ phase: "start" }]);

		clock.advance(16);
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 4, clientX: 34, clientY: 20 });
		document.body.dispatch("pointerup", { pointerId: 4 });
		expect(latest(character).pose).toBe("spawning");
		expect(drags).toEqual([
			{ phase: "start" },
			{ phase: "move", dx: 7, dy: -5 },
			{ phase: "move", dx: 7, dy: -5 },
			{ phase: "end" },
		]);
		expect(document.body.capturedPointers).toEqual([4]);
		expect(document.body.classes.has("dragging")).toBe(false);
	});

	it("鼠标进入后先追踪鼠标，再回正看向用户", () => {
		const { character, clock, document } = createHarness();
		clock.advance(2000);
		document.body.dispatch("pointerenter");
		expect(latest(character)).toMatchObject({ pose: "curious", gaze: "curious" });
		clock.advance(500);
		expect(latest(character)).toMatchObject({ pose: "listening", gaze: "front" });
	});

	it("困倦阶段仍会播放片段并回到 drowsy", () => {
		const { character, clock } = createHarness();
		clock.advance(4 * 60_000);
		expect(latest(character).pose).toBe("drowsy");
		const sceneCount = character.scenes.length;
		clock.advance(30_000);
		expect(character.scenes.length).toBeGreaterThan(sceneCount);
		expect(latest(character).pose).toBe("drowsy");
	});

	it("睡眠阶段轮换梦境变体并在片段之间回到 sleeping", () => {
		const { character, clock } = createHarness();
		clock.advance(10 * 60_000 + 18_000);
		const first = latest(character).variant;
		expect(first).toBe("float");
		clock.advance(6000);
		expect(latest(character).pose).toBe("sleeping");
		clock.advance(18_000);
		const second = latest(character).variant;
		expect(second).toBe("curl");
		expect(second).not.toBe(first);
		clock.advance(6000 + 18_000);
		expect(latest(character).variant).toBe("twitch");
	});

	it("睡眠阶段进入梦境，Agent 活动按保存的睡眠深度先唤醒", () => {
		const { api, character, clock } = createHarness();
		clock.advance(10 * 60_000 + 18_000);
		expect(latest(character)).toMatchObject({
			pose: "dreaming",
			expression: "sleeping",
			gaze: "sleeping",
		});
		expect(["float", "curl", "twitch"]).toContain(latest(character).variant);

		api.update({ activity: "thinking" });
		clock.advance(350);
		expect(latest(character).pose).toBe("waking");
		clock.advance(1800);
		expect(latest(character).pose).toBe("thinking");
	});

	it("困倦片段被 Agent 打断时不依赖当前画面判断唤醒", () => {
		const { api, character, clock } = createHarness();
		clock.advance(4 * 60_000 + 12_200);
		expect(latest(character).pose).toBe("surprised");
		api.update({ activity: "thinking" });
		clock.advance(350);
		expect(latest(character).pose).toBe("waking");
	});

	it("困倦拖动结束后面向用户询问，再回到 drowsy", () => {
		const { character, clock, document } = createHarness();
		clock.advance(4 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 7, clientX: 20, clientY: 30 });
		expect(latest(character).pose).toBe("dragging");
		document.body.dispatch("pointerup", { pointerId: 7 });
		expect(latest(character)).toMatchObject({
			pose: "quizzical",
			expression: "quizzical",
			gaze: "front",
		});
		expect(latest(character).pose).not.toBe("confused");
		clock.advance(2200);
		expect(latest(character).pose).toBe("drowsy");
	});

	it("quizzical 连续选择相反方向且始终使用 front 视线", () => {
		const { character, clock, document } = createHarness();
		clock.advance(2000);
		const directions: Array<number | undefined> = [];
		for (const pointerId of [20, 21]) {
			document.body.dispatch("pointerdown", { button: 0, pointerId, clientX: 20, clientY: 30 });
			document.body.dispatch("pointerup", { pointerId });
			directions.push(latest(character).direction);
			expect(latest(character).gaze).toBe("front");
			clock.advance(2200);
		}
		const [first, second] = directions;
		if (first === undefined || second === undefined) throw new Error("缺少询问方向");
		expect(first).toBe(-second);
	});

	it("睡眠时立即开始原生拖动，并在惊醒后显示 dragging", () => {
		const { character, clock, document, drags } = createHarness();
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 8, clientX: 20, clientY: 30 });
		expect(drags).toEqual([{ phase: "start" }]);
		expect(latest(character).pose).toBe("startled");
		clock.advance(650);
		expect(latest(character).pose).toBe("dragging");
		document.body.dispatch("pointerup", { pointerId: 8 });
		expect(latest(character)).toMatchObject({ pose: "quizzical", gaze: "front" });
	});

	it("单次睡眠打断暂时回到 drowsy，随后快速入睡", () => {
		const { character, clock, document } = createHarness();
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 22, clientX: 20, clientY: 30 });
		document.body.dispatch("pointerup", { pointerId: 22 });
		clock.advance(650 + 2200);
		expect(latest(character).pose).toBe("drowsy");
		clock.advance(19_999);
		expect(latest(character).pose).toBe("drowsy");
		clock.advance(1);
		expect(latest(character).pose).toBe("sleeping");
	});

	it("页面隐藏和减少动态模式不改变惊醒交互顺序", () => {
		const { api, character, clock, document } = createHarness();
		api.setPreferences({ reduceMotion: true });
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 23, clientX: 20, clientY: 30 });
		clock.advance(100);
		document.hidden = true;
		document.dispatch("visibilitychange");
		clock.advance(10_000);
		expect(latest(character).pose).toBe("startled");
		document.hidden = false;
		document.dispatch("visibilitychange");
		clock.advance(550);
		expect(latest(character).pose).toBe("dragging");
	});

	it("睡眠时快速松开会跳过 dragging", () => {
		const { character, clock, document } = createHarness();
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 9, clientX: 20, clientY: 30 });
		document.body.dispatch("pointerup", { pointerId: 9 });
		clock.advance(649);
		expect(latest(character).pose).toBe("startled");
		clock.advance(1);
		expect(latest(character).pose).toBe("quizzical");
		expect(character.scenes.slice(-2).map((scene) => scene.pose)).toEqual(["startled", "quizzical"]);
	});

	it("连续戳弄后伸展并重置睡眠进程", () => {
		const { character, clock, document } = createHarness();
		clock.advance(10 * 60_000);
		for (const pointerId of [10, 11, 12]) {
			document.body.dispatch("pointerdown", { button: 0, pointerId, clientX: 20, clientY: 30 });
			document.body.dispatch("pointerup", { pointerId });
			clock.advance(pointerId === 10 ? 650 + 2200 : 2200);
		}
		expect(latest(character).pose).toBe("stretching");
		clock.advance(3500 + 700 + 900);
		expect(latest(character).pose).toBe("idle");
		clock.advance(60_000);
		expect(latest(character).pose).not.toBe("drowsy");
	});

	it("Agent 活动期间拖动结束后直接恢复活动", () => {
		const { api, character, clock, document } = createHarness();
		api.update({ activity: "thinking" });
		clock.advance(2000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 13, clientX: 20, clientY: 30 });
		expect(latest(character).pose).toBe("dragging");
		document.body.dispatch("pointerup", { pointerId: 13 });
		expect(latest(character).pose).toBe("thinking");
		expect(character.scenes.slice(-2).map((scene) => scene.pose)).toEqual(["dragging", "thinking"]);
	});

	it("角色姿态为 front 和减少动态提供独立视觉语义", () => {
		const windowStub: Record<string, unknown> = {};
		windowStub.window = windowStub;
		const deterministicMath = Object.create(Math) as Math;
		deterministicMath.random = () => 0.5;
		vm.runInNewContext(mathSource, { Math: deterministicMath, window: windowStub });
		vm.runInNewContext(tablesSource, { Math: deterministicMath, window: windowStub });
		vm.runInNewContext(motionSource, { Math: deterministicMath, window: windowStub });
		vm.runInNewContext(expressionSource, { Math: deterministicMath, window: windowStub });
		vm.runInNewContext(gazeSource, { Math: deterministicMath, window: windowStub });
		const motion = windowStub.GROK_MOTION as {
			sample(
				state: string,
				globalSec: number,
				localSec: number,
				now: number,
				context: Record<string, unknown>,
				options: Record<string, unknown>,
			): { rollDeg: number; xPx: number };
		};
		const expression = windowStub.GROK_EXPRESSION as {
			sample(
				state: string,
				globalSec: number,
				localSec: number,
				now: number,
				context: Record<string, unknown>,
				options: Record<string, unknown>,
			): { faceRollDeg: number };
		};
		const gaze = windowStub.GROK_GAZE as { next(state: string): { x: number; y: number } };
		const context = { quizzicalBlinked: false };
		const moving = motion.sample("quizzical", 1, 0.9, 900, context, { direction: 1 });
		const movingFace = expression.sample("quizzical", 1, 0.9, 900, context, { direction: 1 });
		expect(moving.rollDeg).not.toBe(0);
		expect(movingFace.faceRollDeg).not.toBe(0);
		const reduced = motion.sample("quizzical", 1, 0.9, 900, context, {
			direction: 1,
			reduceMotion: true,
		});
		const reducedFace = expression.sample("quizzical", 1, 0.9, 900, context, {
			direction: 1,
			reduceMotion: true,
		});
		expect(reduced.rollDeg).toBe(0);
		expect(reduced.xPx).toBe(0);
		expect(reducedFace.faceRollDeg).not.toBe(0);
		expect(gaze.next("front")).toMatchObject({ x: 0, y: 0 });
	});

	it("销毁时释放监听、计时器和角色", () => {
		const { api, character, clock, document, motion } = createHarness();
		api.destroy();
		clock.advance(10_000);
		expect(character.destroyed).toBe(true);
		expect(character.scenes).toHaveLength(1);
		expect(document.listeners.get("visibilitychange")?.size).toBe(0);
		expect(motion.listeners.get("change")?.size).toBe(0);
		expect(document.body.listeners.get("lostpointercapture")?.size).toBe(0);
		expect(document.body.listeners.get("pointerenter")?.size).toBe(0);
		expect(api.update({ activity: "thinking" })).toBe(false);
	});
});
