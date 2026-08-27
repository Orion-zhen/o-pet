// @ts-check

/** @typedef {"thinking" | "searching" | "coding" | "terminal" | "receiving" | "consulting" | "tooling" | "replying" | "awaiting_approval" | "idle"} Activity */
/** @typedef {"engage" | "progress" | "reply_sent" | "approval_granted" | "approval_denied" | "error_first" | "error_repeated" | "error_stubborn" | "completed_quick" | "completed_normal" | "completed_hard" | "run_failed" | "run_aborted"} Cue */
/** @typedef {"motion" | "face" | "expression" | "gaze" | "shape" | "form" | "decoration" | "particles" | "camera" | "badge"} ChannelName */
/** @typedef {"awake" | "relaxed" | "drowsy" | "sleeping"} IdleDepth */
/** @typedef {"startup" | "waking" | "switching" | "idle" | "activity" | "cue" | "interaction" | "preview"} HostState */

/** @typedef {{ x: number, y: number }} PointerPoint */
/** @typedef {[number, number]} GeometryPoint */
/** @typedef {{ x: number, t: number, v: number }} Spring */
/** @typedef {Readonly<Spring>} SpringSnapshot */
/** @typedef {{ waveAmount: number, wavePhase: number, bumps: Array<{ angle: number, amount: number, width: number }> }} BodyDeformation */
/** @typedef {{ turnRadians: number | null, rollOffsetDeg: number, xOffsetPx: number, yOffsetPx: number, freeRollDeg: number, gazeXPx: number, gazeYPx: number, hopYPx: number, lidOverride?: number | null, eyeScale?: number | null, done?: boolean, requestHop?: boolean }} FrameExtras */
/** @typedef {{ x: number, y: number, width: number, height: number, left: number, top: number }} Bounds */
/** @typedef {{ turn: number, tilt: number, roll: number, scale?: number }} Pose */
/** @typedef {[number, number, number, number, number, number, number, number, number]} Matrix3 */
/** @typedef {{ spring(value: number): Spring, stepSpring(state: Spring, frequency: number, damping: number, dt: number): void, springSteps(dt: number): number, clamp(value: number, minimum: number, maximum: number): number, K2(amount: number): number, Rc(amount: number): number, y1e(amount: number): number, Dke(amount: number): number, Rn(amount: number, elapsed?: number): number, relRot(pose: Pose, home: Pose): Matrix3, mapPointer(rect: DOMRect | Bounds, point: PointerPoint, distanceScale?: number, horizontalRadius?: number, verticalRadius?: number, reach?: number): PointerPoint, random: () => number, rand(minimum: number, maximum: number): number, sign(): number }} MathPort */

/** @typedef {{ channel: ChannelName, id: string | null }} Control */
/** @typedef {{ id: string, channels: Record<ChannelName, Control>, choreography?: string | null }} Preset */
/** @typedef {{ motion: string, face: string, expression: string, gaze: string, shape?: string | null, effect?: string | null, choreography?: string | null }} SceneDefinition */
/** @typedef {{ direction?: number, variant?: string }} SceneDetails */
/** @typedef {{ has(value: string): boolean, values: readonly string[] }} IdRegistry */
/** @typedef {{ motion: IdRegistry, face: IdRegistry, gaze: IdRegistry, choreography: IdRegistry, shape: IdRegistry, form: IdRegistry, decoration: IdRegistry, particles: IdRegistry, camera: IdRegistry, badge: IdRegistry }} AnimationRegistries */
/** @typedef {{ kind: "wink" } | { kind: "spin", turns: number, direction?: number } | { kind: "hop" } | { kind: "pounce", direction?: number, strength: number }} TimelineEvent */
/** @typedef {{ kind: "scene", duration: number, scene: Scene, events?: readonly TimelineEvent[], preserveEffect?: boolean, restart?: boolean } | { kind: "state", duration: number, state: string } | { kind: "pause", duration: number }} TimelineStep */
/** @typedef {{ loop?: boolean, onComplete?: () => void }} TimelineOptions */
/** @typedef {{ cancel(owner?: string): void, destroy(): void, play(owner: string, steps: readonly TimelineStep[], options: TimelineOptions): void }} Timeline */

/** @typedef {{ preset: Preset, direction?: number, variant?: string }} DetailedPreset */
/** @typedef {Preset | DetailedPreset} Scene */
/** @typedef {{ form: string | null, decoration: string | null, particles: string | null, camera: string | null, badge: string | null }} EffectRecipe */
/** @typedef {{ motion: string, face: string, expression: string, gaze: string, shape: string | null, form: string | null, decoration: string | null, particles: string | null, camera: string | null, badge: string | null, choreography: string | null, direction?: number, variant?: string }} ResolvedScene */

/** @typedef {{ eyeTo?: number, eyeMorphX?: number, blinkX?: number, allowAmbientSpin?: boolean, direction?: number, variant?: string | null, reduceMotion?: boolean, slumpAt?: number }} ControllerOptions */
/** @typedef {{ nodUntil: number, nodEnd: number, idleShiftAt: number, idleShiftEnd: number, idleShiftDuration: number, idleShiftDirection: number, sleepTwitchAt: number, sleepTwitchEnd: number, angryShakeUntil: number, impulseAt: number, slumpAt: number, stAt: number, dragCycle: number, notifyPop: boolean }} MotionContext */
/** @typedef {{ wakingBlinked: boolean, stretchBlinked: boolean, quizzicalBlinked: boolean }} ExpressionContext */
/** @typedef {{ fired: Set<number> }} ChoreographyContext */
/** @typedef {{ motion: MotionContext, expression: ExpressionContext, choreography: ChoreographyContext }} ControllerContext */
/** @typedef {{ channel: "action", type: string, direction?: number, turns?: number } | { channel: "particles", type: "burst", count: number, strength: number }} ChoreographyEvent */

/** @typedef {{ setTimeout(callback: () => void, delay: number): unknown, clearTimeout(handle: unknown): void }} TimerClock */
/** @typedef {{ requestAnimationFrame(callback: (time: number) => void): unknown, cancelAnimationFrame(handle: unknown): void }} FrameClock */
/** @typedef {FrameClock & { now(): number }} CharacterClock */
/** @typedef {{ now(): number, setTimeout(callback: () => void, delay: number): number | null, clearTimeout(id: number | null): void, requestAnimationFrame(callback: (time: number) => void): number | null, cancelAnimationFrame(id: number | null): void, pause(reason: string): void, resume(reason: string): void, destroy(): void }} Scheduler */

/**
 * @typedef {object} CharacterPort
 * @property {(scene: Scene) => void} playPreset
 * @property {(scene: Scene, options?: { resetEyes?: boolean }) => void} setPreset
 * @property {(value: boolean) => void} setPaused
 * @property {() => void} renderOnce
 * @property {() => void} winkOnce
 * @property {(turns?: number, direction?: number) => void} spinOnce
 * @property {() => void} hopOnce
 * @property {(direction?: number, strength?: number) => void} pounceOnce
 * @property {(target: PointerPoint | null) => void} setGazeTarget
 * @property {(target: PointerPoint | null) => void} setPointerPosition
 * @property {(shape: string) => void} setShape
 * @property {(paint: BodyPaint) => void} setInk
 * @property {(color: string) => void} setEyeColor
 * @property {(value: boolean) => void} setReduceMotion
 * @property {() => void} destroy
 */

/** @typedef {{ kind: "solid", color: string } | { kind: "linear", angle: number, accent: string, stops: readonly PaintStop[] } | { kind: "radial", center: readonly [number, number], accent: string, blur: number, stops: readonly PaintStop[] }} BodyPaint */
/** @typedef {{ offset: number, color: string, opacity: number }} PaintStop */
/** @typedef {{ shape: string, body_color: BodyPaint, eye_color: string }} RendererPreferences */
/** @typedef {{ phase: "start" | "end" } | { phase: "move", dx: number, dy: number }} DragMessage */
/** @typedef {{ activity: Activity, cue?: Cue }} RendererUpdate */

/**
 * @typedef {object} IdlePort
 * @property {(key: string) => number} chooseDirection
 * @property {(at?: number) => IdleDepth} depthAt
 * @property {() => boolean} hover
 * @property {() => boolean} leave
 * @property {() => boolean} recordPoke
 * @property {() => void} recoverFromSleep
 * @property {(startedAt?: number) => void} reset
 * @property {() => void} start
 * @property {() => void} stop
 */

/**
 * @typedef {object} PresenterPort
 * @property {() => void} clearOverride
 * @property {() => void} destroy
 * @property {(step: TimelineStep) => void} enterStep
 * @property {(target: PointerPoint | null) => void} setGazeTarget
 * @property {(scene: Scene) => void} setOverride
 * @property {(scene: Scene) => void} setScene
 */

/**
 * @typedef {object} PresetCatalog
 * @property {Readonly<Record<string, Preset>>} scenes
 * @property {Readonly<Record<string, Preset>>} actions
 * @property {(state: string) => Preset} fromState
 * @property {(preset: Preset, details: SceneDetails) => DetailedPreset} withDetails
 * @property {(base: Preset, replacement: Preset, channelNames: readonly ChannelName[]) => Preset} replaceChannels
 * @property {(scene: Scene) => ResolvedScene} resolve
 */

/** @typedef {{ EYE_PLAYLIST: Record<string, readonly number[]>, EYE_HOLD_MS: Record<string, readonly [number, number]>, BLINK_MS: Record<string, readonly [number, number] | null> }} AnimationTables */
/** @typedef {AnimationTables & { THINKING_ALT: { cycleMs: number, dotStarts: readonly number[], dotDuration: number, mergeAt: number, absorbAt: number }, SPRINGS: { spin: [number, number], x: [number, number], y: [number, number], squash: [number, number], blink: [number, number], eyeScale: [number, number], front: [number, number], gazeX: [number, number], gazeY: [number, number], notify: [number, number], humDots: [number, number], visual: [number, number], visualMix: [number, number], shape: [number, number], formTurn: [number, number], spinTurn: [number, number] }, FACE_TUNE: { size: number, gap: number, height: number, eyeWidth: number, eyeHeight: number }, POSE: { turn: number, tilt: number, roll: number, scale: number }, POSE_HOME: { turn: number, tilt: number, roll: number }, WINK_STATES: ReadonlySet<string>, poseScale(name: string): number, shapeEyeScale(name: string): number }} RuntimeTables */
/** @typedef {{ face: FaceMetrics, ring: GeometryPoint[], tilt: number, belt: number }} RuntimeShapeMetrics */
/** @typedef {{ lerpPoly(from: GeometryPoint[], to: GeometryPoint[], amount: number): GeometryPoint[], lerpFace(from: FaceMetrics, to: FaceMetrics, amount: number): FaceMetrics, shapeMetrics(name: string): RuntimeShapeMetrics, lerpRing(from: GeometryPoint[], to: GeometryPoint[], amount: number): GeometryPoint[] }} RuntimeGeometry */
/** @typedef {{ queueBlink(queue: Array<{ at: number, v: number }>, now: number): void, consumeBlink(queue: Array<{ at: number, v: number }>, now: number): number | null }} EyeController */
/** @typedef {{ setPreferences(preferences: RendererPreferences): void, showAction(name: string): void, update(update: RendererUpdate): boolean }} RendererClientApi */
/** @typedef {RendererClientApi & { destroy(): void }} RendererApi */
/** @typedef {{ formState: string | null, decorationState: string | null, particleState: string | null, cameraState: string | null, badgeState: string | null, formAt: number, decorationAt: number, particleAt: number, formBlend: SpringSnapshot, formMix: SpringSnapshot, decorationBlend: SpringSnapshot, decorationMix: SpringSnapshot, cameraBlend: SpringSnapshot, cameraMix: SpringSnapshot, notify: SpringSnapshot, humDots: SpringSnapshot, formTurn: SpringSnapshot, formKind: string | null, formPrev: string | null, decoKind: string | null, decoPrev: string | null, cameraKind: string | null, cameraPrev: string | null, formOverlayAt: number }} VisualFrame */
/** @typedef {VisualFrame & { now: number, badgeColor: string, blink: SpringSnapshot, bodyDeformation: BodyDeformation | null, effectSpinRadians: number, extras: Readonly<FrameExtras>, eyeLids: readonly [number, number] | null, eyeMorph: SpringSnapshot, eyePolys: [GeometryPoint[], GeometryPoint[]], eyeScale: SpringSnapshot, eyeScaleProp: number, faceRoll: number, faceTune: Readonly<{ size: number, gap: number, height: number, eyeWidth: number, eyeHeight: number }>, frontBlend: SpringSnapshot, gazeState: string, gazeTarget: PointerPoint | null, gazeX: SpringSnapshot, gazeY: SpringSnapshot, sceneDirection: number, pointer: Readonly<{ x: number, y: number, tx: number, ty: number }>, pointerRaw: PointerPoint | null, pose: Readonly<{ turn: number, tilt: number, roll: number, scale: number }>, poseHome: Readonly<{ turn: number, tilt: number, roll: number }>, prevBelt: number | null, prevFace: FaceMetrics | null, prevRing: GeometryPoint[] | null, prevShape: string, prevTilt: number | null, pxW: number, reduceMotion: boolean, shapeName: string, shapeSpring: SpringSnapshot, spin: SpringSnapshot, squashX: SpringSnapshot, squash: SpringSnapshot, tx: SpringSnapshot, ty: SpringSnapshot, winkAt: number, winkEye: number }} FrameModel */
/** @typedef {{ bounds(): DOMRect | Bounds, burst(count: number, strength: number, spread?: number): void, destroy(): void, render(frame: Readonly<FrameModel>): void, resetInk(): void, resetPlayback(): void, setBodyPaint(paint: BodyPaint): void, setReduceMotion(value: boolean): void, setStyle(name: string, value: string): void, setViewportStyle(name: "transform" | "transformOrigin", value: string): void, updateParticles(now: number, dt: number, options: { spinAngle: number, emitTrails: boolean, sizeScale: number, wideStyle: boolean, sustainBelts: boolean }): void }} RendererPort */
/** @typedef {{ create(dependencies: object, options: object): CharacterPort }} CharacterFactory */
/** @typedef {{ document: Document, clock: TimerClock, frameClock: FrameClock, now: () => number, random: () => number, motionQuery: MediaQueryList, viewportWidth: () => number, svg: SVGSVGElement, pointerTarget: Window, postDrag: (message: DragMessage) => void }} RendererOptions */
/** @typedef {{ runtime?: CharacterFactory }} RendererOverrides */

/** @typedef {{ x: number, y: number, sx: number, sy: number, eye: number, leftDX?: number }} FaceMetrics */
/** @typedef {{ label: string, path: string, face: FaceMetrics, radius: number, tiltScale: number, top: number, bottom: number, beltRadius?: number }} ShapeData */
/** @typedef {{ Re: number, G9e: number, VJt: number, viewBox: { minX: number, minY: number, width: number, height: number }, blobPath: string, starPath: string, starColor: string, eyes: Array<[GeometryPoint[], GeometryPoint[]]>, shapes: Record<string, ShapeData>, solids: Record<string, number[][]> }} GeometryData */

export {};
