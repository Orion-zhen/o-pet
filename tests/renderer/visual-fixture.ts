import { createHash } from "node:crypto";

import * as presetsModule from "../../renderer/catalog/presets.js";
import * as actions from "../../renderer/engine/actions.js";
import * as choreography from "../../renderer/engine/channels/choreography.js";
import * as expression from "../../renderer/engine/channels/expression.js";
import * as gaze from "../../renderer/engine/channels/gaze.js";
import * as motion from "../../renderer/engine/channels/motion.js";
import * as frame from "../../renderer/engine/frame.js";
import { create as createMath } from "../../renderer/engine/math.js";
import * as pointerTracker from "../../renderer/engine/pointer-tracker.js";
import { create as createRuntime } from "../../renderer/engine/runtime.js";
import * as visualChannels from "../../renderer/engine/visual-channels.js";
import { create as createTables } from "../../renderer/catalog/tables.js";
import { create as createHost } from "../../renderer/host.js";
import { create as createEffects } from "../../renderer/view/effects.js";
import { create as createEyes } from "../../renderer/view/eyes.js";
import geometryData from "../../renderer/view/geometry-data.js";
import { create as createGeometry } from "../../renderer/view/geometry.js";
import * as particles from "../../renderer/view/particles.js";
import { create as createSvgRenderer } from "../../renderer/view/svg.js";
import type { FrameModel, PresetCatalog, RendererPort } from "../../renderer/types.js";
import { EventTargetStub, SvgElementStub } from "./browser-stubs.js";
import type { RendererFactory } from "./host-fixture.js";

type AnimationFrameCallback = (time: number) => void;

interface VisualCharacter {
	readonly celebrateAt: number | null;
	readonly ctx: Record<string, unknown>;
	readonly extras: { hopYPx: number; turnRadians: number | null };
	readonly eyeTo: number;
	readonly frontBlend: { t: number; v: number; x: number };
	readonly faceAt: number;
	readonly hopAt: number;
	readonly motionAt: number;
	readonly particleAt: number;
	readonly preferredShapeName: string;
	readonly shapeName: string;
	readonly shapeSpring: { t: number; v: number; x: number };
	readonly squashX: { t: number; v: number; x: number };
	readonly squash: { t: number; v: number; x: number };
	readonly ty: { t: number; v: number; x: number };
	readonly spinTurn: { t: number; v: number; x: number } | null;
	readonly trick: { kind: string } | null;
	playPreset(preset: unknown): void;
	setInk(value: unknown): void;
	setPaused(value: boolean): void;
	setPreset(preset: unknown, options?: { resetEyes?: boolean }): void;
	setReduceMotion(value: boolean): void;
	setShape(shape: string): void;
	winkOnce(eye?: number): void;
	spinOnce(turns?: number, direction?: number): void;
	hopOnce(): void;
	pounceOnce(direction?: number, strength?: number): void;
	renderOnce(): void;
	destroy(): void;
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
	latestFrame(): Readonly<FrameModel>;
	pendingFrames(): number;
	presets: PresetCatalog;
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
	const requestAnimationFrame = (callback: AnimationFrameCallback): number => {
		const id = nextFrameId++;
		frames.set(id, callback);
		return id;
	};
	const cancelAnimationFrame = (id: number): void => void frames.delete(id);
	const factory: RendererFactory = {
		create(options) {
			// @ts-expect-error 浏览器替身只实现渲染器实际使用的宿主接口。
			return createHost(options);
		},
	};
	const presets: PresetCatalog = presetsModule;
	const svg = new SvgElementStub("svg");
	const math = createMath(random);
	const geometry = createGeometry({ data: geometryData, math });
	const tables = createTables();
	const effects = createEffects({ data: geometryData, math, tables });
	const eyes = createEyes({ geometry, math }, random);
	let renderedFrame: Readonly<FrameModel> | null = null;
	const createRenderer = (): RendererPort => {
		const rendererOptions = {
			document: documentStub,
			initialShape: "blob",
			rand: math.rand,
			random,
			svg,
		};
		const rendererDependencies = {
			data: geometryData,
			effects,
			eyes,
			geometry,
			math,
			particles,
			tables,
		};
		// @ts-expect-error SVG 替身只实现视图实际使用的 DOM 接口。
		const renderer = createSvgRenderer(rendererDependencies, rendererOptions);
		return {
			...renderer,
			render(frameModel: Readonly<FrameModel>): void {
				renderedFrame = frameModel;
				renderer.render(frameModel);
			},
		};
	};
	const character: VisualCharacter = createRuntime({
		actions,
		choreography,
		data: geometryData,
		effects,
		expression,
		frame,
		eyes,
		gaze,
		geometry,
		math,
		motion,
		presets,
		pointerTracker,
		tables,
		visualChannels,
	}, {
		clock: {
			cancelAnimationFrame,
			now: (): number => now,
			requestAnimationFrame,
		},
		createRenderer,
		random,
	});
	return {
		character,
		faceCenter(shape) {
			const face = geometryData.shapes[shape]?.face;
			if (face === undefined) throw new Error(`缺少身形 ${shape}`);
			return { x: geometryData.Re + face.x, y: geometryData.Re + face.y };
		},
		factory,
		frame(time) {
			now = time;
			const callbacks = [...frames.values()];
			frames.clear();
			for (const callback of callbacks) callback(time);
		},
		latestFrame() {
			if (renderedFrame === null) throw new Error("角色尚未提交帧模型");
			return renderedFrame;
		},
		pendingFrames: () => frames.size,
		presets,
		setTime(time) {
			now = time;
		},
		svg,
	};
}
