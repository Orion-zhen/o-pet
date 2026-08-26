import vm from "node:vm";
import { describe, expect, it } from "vitest";

import { SvgElementStub } from "./browser-stubs.js";
import { geometryEngineSource, mathSource, particlesSource } from "./sources.js";

interface ParticleController {
	reset(spinAngle?: number): void;
	update(now: number, dt: number, options: {
		emitTrails: boolean;
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
		OPET_PARTICLES?: { create(options: unknown): ParticleController };
		OPET_GEO: { Re: number };
	} = { OPET_GEO: { Re: 114.2705 } };
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
	const factory = windowStub.OPET_PARTICLES;
	if (factory === undefined) throw new Error("粒子渲染器未加载");
	return {
		elements,
		particles: factory.create({
			back,
			clamp: (number: number, minimum: number, maximum: number): number => (
				Math.min(maximum, Math.max(minimum, number))
			),
			data: windowStub.OPET_GEO,
			document: context.document,
			front,
			getRadius: () => 52,
			idPrefix: "test-",
			rand: (minimum: number, maximum: number): number => minimum + 0.5 * (maximum - minimum),
			random: deterministicMath.random,
		}),
		removedTrails: () => removedTrails,
	};
}

describe("渲染器粒子生命周期", () => {
	it("长时间 loading 会销毁旧彩带并保持新彩带可见", () => {
		const { elements, particles, removedTrails } = createParticleHarness();
		let spinAngle = 0;
		for (let now = 0; now <= 12_000; now += 16) {
			const dt = 0.016;
			spinAngle += (now < 1_000 ? 7 : 3) * dt;
			particles.update(now, dt, {
				emitTrails: true,
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

	it("未声明旋转意图时角度跳变不会生成彩带", () => {
		const { elements, particles } = createParticleHarness();
		particles.update(0, 0.016, {
			emitTrails: false,
			sizeScale: 1,
			spinAngle: 0,
			sustainBelts: false,
			wideStyle: false,
		});
		particles.update(16, 0.016, {
			emitTrails: false,
			sizeScale: 1,
			spinAngle: 0.8,
			sustainBelts: false,
			wideStyle: false,
		});
		expect(elements.some((element) => element.attributes.has("data-trail"))).toBe(false);
	});
});
