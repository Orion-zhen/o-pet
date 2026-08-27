import { create as createRenderer } from "../../renderer/host.js";
import type { DragMessage, RendererApi } from "../../renderer/types.js";

import { ClockStub, DocumentStub, EventTargetStub, MotionQueryStub } from "./browser-stubs.js";

type CharacterOptions = object;

interface CharacterScene {
	pose: string;
	expression: string;
	effect: string | null;
	gaze: string;
	shape?: string | null;
	direction?: number;
	variant?: string;
}

class CharacterStub {
	readonly scenes: CharacterScene[];
	readonly shapes: string[] = [];
	readonly bodyColors: unknown[] = [];
	readonly eyeColors: string[] = [];
	readonly paused: boolean[] = [];
	readonly reducedMotion: boolean[] = [];
	readonly playedStates: string[] = [];
	destroyed = false;
	renderCount = 0;
	hopCount = 0;
	pounceCount = 0;
	spinCount = 0;
	winkCount = 0;

	constructor(_svg: unknown, _options: CharacterOptions) {
		this.scenes = [{
			pose: "spawning",
			expression: "spawning",
			effect: "spawning",
			gaze: "spawning",
			shape: null,
		}];
	}

	setScene(scene: CharacterScene): void {
		this.scenes.push(scene);
	}

	setPreset(value: unknown): void {
		const detailed = value as {
			preset?: { channels: Record<string, { id: string | null }> };
			channels?: Record<string, { id: string | null }>;
			direction?: number;
			variant?: string;
		};
		const preset = detailed.preset ?? detailed;
		const channels = preset.channels;
		if (channels === undefined) throw new Error("无效动画预设");
		const effectsByForm: Record<string, string> = {
			bang: "alerting",
			dots: "thinking",
			gather: "spawning",
			orbit: "orbit",
			pencil: "writing",
			radar: "radar",
			receive: "receiving",
			send: "sending",
			wave: "dictating",
			whirl: "loading",
		};
		const form = channels.form?.id;
		const effect = form === null || form === undefined
			? channels.particles?.id === "wide-spin-belts"
				? "humming"
				: channels.decoration?.id === "thought-pulse"
					? "thinking-alt"
					: channels.badge?.id === "notification" ? "notifying" : null
			: effectsByForm[form] ?? form;
		this.setScene({
			pose: channels.motion?.id ?? "idle",
			expression: channels.expression?.id ?? "idle",
			effect,
			gaze: channels.gaze?.id ?? "idle",
			shape: channels.shape?.id ?? null,
			...(detailed.direction === undefined ? {} : { direction: detailed.direction }),
			...(detailed.variant === undefined ? {} : { variant: detailed.variant }),
		});
	}

	playPreset(value: unknown): void {
		const preset = value as { id?: string };
		const state = preset.id?.replace(/^state:/, "") ?? "unknown";
		this.playedStates.push(state);
		this.setPreset(value);
	}

	winkOnce(): void {
		this.winkCount += 1;
	}

	spinOnce(): void {
		this.spinCount += 1;
	}

	hopOnce(): void {
		this.hopCount += 1;
	}

	pounceOnce(): void {
		this.pounceCount += 1;
	}

	setGazeTarget(_target: { x: number; y: number } | null): void {}

	setPointerPosition(_target: { x: number; y: number } | null): void {}

	setShape(shape: string): void {
		this.shapes.push(shape);
	}

	setInk(paint: unknown): void {
		this.bodyColors.push(paint);
	}

	setEyeColor(color: string): void {
		this.eyeColors.push(color);
	}

	setReduceMotion(value: boolean): void {
		this.reducedMotion.push(value);
	}

	setPaused(value: boolean): void {
		this.paused.push(value);
	}

	renderOnce(): void {
		this.renderCount += 1;
	}

	destroy(): void {
		this.destroyed = true;
	}
}

export interface RendererFactory {
	create(options: {
		clock: ClockStub;
		document: DocumentStub;
		frameClock: ClockStub;
		motionQuery: MotionQueryStub;
		now: () => number;
		pointerTarget: EventTargetStub;
		postDrag: (message: DragMessage) => void;
		random: () => number;
		svg: object;
		viewportWidth: () => number;
	}): RendererApi;
}

export function createHarness(initiallyHidden = false, random = (): number => 0): {
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

		override setPreset(value: unknown): void {
			const previous = this.scenes.at(-1);
			super.setPreset(value);
			const current = this.scenes.at(-1);
			if (
				previous?.pose === "playful"
				&& previous.expression === "playful"
				&& current?.pose === "playful"
				&& current.expression === "playful"
			) highEnergyAt.push(clock.now);
		}

		override spinOnce(): void {
			super.spinOnce();
			highEnergyAt.push(clock.now);
		}

		override hopOnce(): void {
			super.hopOnce();
			highEnergyAt.push(clock.now);
		}
	}
	const pointerTarget = new EventTargetStub();
	const document = new DocumentStub();
	document.hidden = initiallyHidden;
	const motion = new MotionQueryStub();
	const drags: DragMessage[] = [];
	const rendererOptions = {
		clock,
		document,
		frameClock: clock,
		motionQuery: motion,
		now: () => clock.now,
		pointerTarget,
		postDrag: (message: DragMessage) => drags.push(message),
		random,
		svg: {},
		viewportWidth: () => 1,
	};
	// @ts-expect-error 浏览器替身只实现渲染器实际使用的宿主接口。
	const api = createRenderer(rendererOptions, {
		runtime: {
			create: (_dependencies: unknown, options: CharacterOptions): CharacterStub =>
				new HarnessCharacter({}, options),
		},
	});
	const character = instances[0];
	if (character === undefined) throw new Error("渲染器未创建角色");
	return { api, character, clock, document, drags, highEnergyAt, motion };
}

export function latest(character: CharacterStub): CharacterScene {
	const current = character.scenes.at(-1);
	if (current === undefined) throw new Error("角色没有动画场景");
	return current;
}
