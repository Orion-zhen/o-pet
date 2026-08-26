import { createHash } from "node:crypto";
import vm from "node:vm";

import { EventTargetStub, SvgElementStub } from "./browser-stubs.js";
import type { RendererFactory } from "./host-fixture.js";
import {
	actionGroupsSource, actionsSource, activitiesSource, choreographySource, cuesSource,
	effectsSource, expressionSource, gazeSource, geometryEngineSource, geometrySource,
	hostSource, idleSource, interactionSource, mathSource, motionSource, particlesSource,
	pointerSource, preferencesSource, presenterSource, presetsSource, renderSource,
	runtimeSource, schedulerSource, sequencesSource, tablesSource, timelineSource,
	visualChannelsSource, eyesSource,
} from "./sources.js";

type AnimationFrameCallback = (time: number) => void;

interface VisualPreset {
	channels: Record<string, { id: string | null }>;
}

interface VisualCharacter {
	readonly celebrateAt: number | null;
	readonly ctx: Record<string, unknown>;
	readonly extras: { hopYPx: number; turnRadians: number | null };
	readonly eyeTo: number;
	readonly faceAt: number;
	readonly hopAt: number;
	readonly motionAt: number;
	readonly particleAt: number;
	readonly spinTurn: { t: number; v: number; x: number } | null;
	readonly trick: { kind: string } | null;
	playPreset(preset: unknown): void;
	setPaused(value: boolean): void;
	setPreset(preset: unknown, options?: { resetEyes?: boolean }): void;
	setReduceMotion(value: boolean): void;
	setShape(shape: string): void;
	winkOnce(eye?: number): void;
	spinOnce(turns?: number, direction?: number): void;
	hopOnce(): void;
	pounceOnce(direction?: number, strength?: number): void;
	destroy(): void;
}

class VisualWindowStub extends EventTargetStub {
	OPetRenderer?: RendererFactory;
	GROK_ACTIONS?: object;
	GROK_CHOREOGRAPHY?: object;
	GROK_EFFECTS?: { create(dependencies: Record<string, unknown>): object };
	GROK_EXPRESSION?: object;
	GROK_EYES?: {
		create(dependencies: Record<string, unknown>, random: () => number): object;
	};
	GROK_GAZE?: object;
	GROK_GEO?: {
		Re: number;
		shapes: Record<string, { face: { x: number; y: number } }>;
	};
	GROK_GEOMETRY?: { create(dependencies: Record<string, unknown>): object };
	GROK_MATH?: { create(random: () => number): { rand(minimum: number, maximum: number): number } };
	GROK_MOTION?: object;
	GROK_PARTICLES?: object;
	GROK_PRESETS?: {
		scenes: Record<string, VisualPreset>;
		withDetails(preset: VisualPreset, details: Record<string, unknown>): unknown;
	};
	GROK_RENDER?: {
		create(dependencies: Record<string, unknown>, options: Record<string, unknown>): unknown;
	};
	GROK_TABLES?: { create(data: unknown, actionGroups: unknown): object };
	O_PET_ACTION_GROUPS?: unknown;
	O_PET_RUNTIME?: {
		create(dependencies: Record<string, unknown>, options: Record<string, unknown>): VisualCharacter;
	};
	O_PET_VISUAL_CHANNELS?: object;
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

export function svgHash(svg: SvgElementStub): string {
	return createHash("sha256").update(JSON.stringify(serializeSvg(svg))).digest("hex").slice(0, 16);
}

export function hasLiveTrail(element: SvgElementStub): boolean {
	return element.attributes.has("data-trail") || element.children.some(hasLiveTrail);
}

function renderedEyeElements(element: SvgElementStub): SvgElementStub[] {
	const eyes: SvgElementStub[] = [];
	const visit = (current: SvgElementStub): void => {
		if (current.attributes.get("fill") === "var(--bg, #f3efe6)") eyes.push(current);
		for (const child of current.children) visit(child);
	};
	visit(element);
	return eyes;
}

export function renderedEyeCenters(element: SvgElementStub): Array<{ x: number; y: number }> {
	return renderedEyeElements(element).map((eye) => {
		const transform = eye.attributes.get("transform") ?? "";
		const match = /^translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(transform);
		if (match?.[1] === undefined || match[2] === undefined)
			throw new Error("眼形缺少位移");
		return { x: Number(match[1]), y: Number(match[2]) };
	});
}

export function renderedEyeSizes(
	element: SvgElementStub,
): Array<{ height: number; width: number }> {
	return renderedEyeElements(element).map((eye) => {
		const coordinates = (
			eye.attributes.get("d")?.match(/-?[\d.]+/g) ?? []
		).map(Number);
		const xs = coordinates.filter((_, index) => index % 2 === 0);
		const ys = coordinates.filter((_, index) => index % 2 === 1);
		const transform = eye.attributes.get("transform") ?? "";
		const scale = /scale\((-?[\d.]+) (-?[\d.]+)\)/.exec(transform);
		if (
			xs.length === 0
			|| ys.length === 0
			|| scale?.[1] === undefined
			|| scale[2] === undefined
		) throw new Error("眼形缺少尺寸");
		return {
			height:
				(Math.max(...ys) - Math.min(...ys)) * Math.abs(Number(scale[2])),
			width:
				(Math.max(...xs) - Math.min(...xs)) * Math.abs(Number(scale[1])),
		};
	});
}

export function createVisualHarness(random: () => number = () => 0.5): {
	character: VisualCharacter;
	faceCenter(shape: string): { x: number; y: number };
	factory: RendererFactory;
	frame(time: number): void;
	pendingFrames(): number;
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
	deterministicMath.random = random;
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
		actionGroupsSource,
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
		visualChannelsSource,
		runtimeSource,
		schedulerSource,
		timelineSource,
		presenterSource,
		activitiesSource,
		idleSource,
		cuesSource,
		interactionSource,
		pointerSource,
		preferencesSource,
		hostSource,
	]) vm.runInNewContext(source, context);

	const runtime = windowStub.O_PET_RUNTIME;
	const factory = windowStub.OPetRenderer;
	const presets = windowStub.GROK_PRESETS;
	const mathFactory = windowStub.GROK_MATH;
	const geometryFactory = windowStub.GROK_GEOMETRY;
	const effectsFactory = windowStub.GROK_EFFECTS;
	const eyesFactory = windowStub.GROK_EYES;
	const rendererFactory = windowStub.GROK_RENDER;
	const tablesFactory = windowStub.GROK_TABLES;
	if (
		runtime === undefined
		|| factory === undefined
		|| presets === undefined
		|| mathFactory === undefined
		|| geometryFactory === undefined
		|| effectsFactory === undefined
		|| eyesFactory === undefined
		|| rendererFactory === undefined
		|| tablesFactory === undefined
	) {
		throw new Error("完整动画引擎未加载");
	}
	const svg = new SvgElementStub("svg");
	const math = mathFactory.create(deterministicMath.random);
	const geometry = geometryFactory.create({ data: windowStub.GROK_GEO, math });
	const tables = tablesFactory.create(windowStub.GROK_GEO, windowStub.O_PET_ACTION_GROUPS);
	const effects = effectsFactory.create({ data: windowStub.GROK_GEO, math });
	const eyes = eyesFactory.create({ geometry, math }, deterministicMath.random);
	const createRenderer = (): unknown => rendererFactory.create({
		data: windowStub.GROK_GEO,
		effects,
		eyes,
		geometry,
		math,
		particles: windowStub.GROK_PARTICLES,
		tables,
	}, {
		document: documentStub,
		initialShape: "blob",
		rand: math.rand,
		random: deterministicMath.random,
		svg,
	});
	const character = runtime.create({
		actions: windowStub.GROK_ACTIONS,
		choreography: windowStub.GROK_CHOREOGRAPHY,
		data: windowStub.GROK_GEO,
		effects,
		expression: windowStub.GROK_EXPRESSION,
		eyes,
		gaze: windowStub.GROK_GAZE,
		geometry,
		math,
		motion: windowStub.GROK_MOTION,
		presets,
		tables,
		visualChannels: windowStub.O_PET_VISUAL_CHANNELS,
	}, {
		clock: {
			cancelAnimationFrame,
			now: (): number => now,
			requestAnimationFrame,
		},
		color: "black",
		createRenderer,
		followPointer: false,
		math,
		random: deterministicMath.random,
		shape: "blob",
		state: "spawning",
	});
	return {
		character,
		faceCenter(shape) {
			const data = windowStub.GROK_GEO;
			const face = data?.shapes[shape]?.face;
			if (data === undefined || face === undefined)
				throw new Error(`缺少身形 ${shape}`);
			return { x: data.Re + face.x, y: data.Re + face.y };
		},
		factory,
		frame(time) {
			now = time;
			const callbacks = [...frames.values()];
			frames.clear();
			for (const callback of callbacks) callback(time);
		},
		pendingFrames: () => frames.size,
		presets,
		setTime(time) {
			now = time;
		},
		svg,
	};
}
