type EventListener = (event: RendererEvent) => void;
interface RendererEvent {
	button?: number;
	buttons?: number;
	pointerId?: number;
	clientX?: number;
	clientY?: number;
}

export class EventTargetStub {
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

export class DocumentStub extends EventTargetStub {
	hidden = false;
	readonly body = new BodyStub();
	readonly documentElement = new EventTargetStub();

	createElementNS(_namespace: string, tag: string): SvgElementStub {
		return new SvgElementStub(tag);
	}
}

export class MotionQueryStub extends EventTargetStub {
	matches = false;
}

export class ClockStub {
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

export class SvgElementStub {
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
