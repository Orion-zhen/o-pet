import { describe, expect, it } from "vitest";

import { create } from "../../renderer/view/particles.js";
import { SvgElementStub } from "./browser-stubs.js";

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
	const data = { Re: 114.2705 };
	const deterministicRandom = (): number => 0.5;
	const document = {
		createElementNS: (_namespace: string, tag: string): SvgElementStub =>
			createElement(tag),
	};
	return {
		elements,
		particles: create({
			back,
			clamp: (number: number, minimum: number, maximum: number): number => (
				Math.min(maximum, Math.max(minimum, number))
			),
			data,
			document,
			front,
			getRadius: () => 52,
			idPrefix: "test-",
			rand: (minimum: number, maximum: number): number => minimum + 0.5 * (maximum - minimum),
			random: deterministicRandom,
		}),
		removedTrails: () => removedTrails,
	};
}

function advanceLoading(
	particles: ParticleController,
	from: number,
	through: number,
	spinAngle: number,
): number {
	for (let now = from; now <= through; now += 16) {
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
	return spinAngle;
}

describe("渲染器粒子生命周期", () => {
	it("持续 loading 会在旧彩带退场前生成下一组", () => {
		const { elements, particles, removedTrails } = createParticleHarness();
		const spinAngle = advanceLoading(particles, 0, 1_000, 0);
		const firstGenerationSize = elements.filter((element) => (
			element.attributes.has("data-trail")
		)).length;

		advanceLoading(particles, 1_008, 4_000, spinAngle);
		const overlappingSize = elements.filter((element) => (
			element.attributes.has("data-trail")
		)).length;

		expect(firstGenerationSize).toBeGreaterThan(0);
		expect(removedTrails()).toBe(0);
		expect(overlappingSize).toBeGreaterThan(firstGenerationSize);
	});

	it("长时间 loading 会销毁旧彩带并保持新彩带可见", () => {
		const { elements, particles, removedTrails } = createParticleHarness();
		advanceLoading(particles, 0, 12_000, 0);

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
