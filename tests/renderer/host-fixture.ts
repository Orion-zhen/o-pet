import vm from "node:vm";

import { ClockStub, DocumentStub, EventTargetStub, MotionQueryStub } from "./browser-stubs.js";
import {
	actionGroupsSource, activitiesSource, cuesSource, hostSource, idleSource,
	interactionSource, pointerSource, preferencesSource, presenterSource, presetsSource,
	schedulerSource, sequencesSource, tablesSource, timelineSource,
} from "./sources.js";

interface CharacterOptions {
	color: string;
	followPointer: boolean;
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
	readonly playedStates: string[] = [];
	colorId: string;
	destroyed = false;
	hopCount = 0;
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
				: channels.badge?.id === "notification" ? "notifying" : null
			: effectsByForm[form] ?? form;
		this.setScene({
			pose: channels.motion?.id ?? "idle",
			expression: channels.expression?.id ?? "idle",
			effect,
			gaze: channels.gaze?.id ?? "idle",
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
	showAction(name: string): boolean;
	update(update: RendererUpdate): boolean;
}

type DragMessage = { phase: "start" | "end" } | { phase: "move"; dx: number; dy: number };

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
	const windowStub: Record<string, unknown> = {
		addEventListener: pointerTarget.addEventListener.bind(pointerTarget),
		removeEventListener: pointerTarget.removeEventListener.bind(pointerTarget),
		GROK_GEO: {
			palette: { black: {}, blue: {} },
			shapes: { blob: {}, cloud: {} },
		},
		GROK_GEOMETRY: { create: (): object => ({}) },
		GROK_EFFECTS: { create: (): object => ({}) },
		GROK_EYES: { create: (): object => ({}) },
		GROK_MATH: {
			create: (source: () => number): { rand(minimum: number, maximum: number): number } => ({
				rand: (minimum, maximum) => minimum + source() * (maximum - minimum),
			}),
		},
		GROK_RENDER: { create: (): object => ({}) },
		O_PET_RUNTIME: {
			create: (_dependencies: unknown, options: CharacterOptions): CharacterStub => new HarnessCharacter({}, options),
		},
	};
	windowStub.window = windowStub;
	vm.runInNewContext(actionGroupsSource, windowStub);
	vm.runInNewContext(tablesSource, windowStub);
	vm.runInNewContext(presetsSource, windowStub);
	vm.runInNewContext(sequencesSource, windowStub);
	for (const source of [
		schedulerSource,
		timelineSource,
		presenterSource,
		activitiesSource,
		idleSource,
		cuesSource,
		interactionSource,
		pointerSource,
		preferencesSource,
	]) vm.runInNewContext(source, windowStub);
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
		pointerTarget,
		postDrag: (message) => drags.push(message),
		random,
		svg: {},
		viewportWidth: () => 1,
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
