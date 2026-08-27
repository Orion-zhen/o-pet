interface Window {
	oPetNative: {
		postDrag(message: import("./types.js").DragMessage): void;
		ready(): void;
	};
	oPet: Readonly<import("./types.js").RendererClientApi>;
}
