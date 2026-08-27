// @ts-check

/**
 * @typedef {object} EffectLayer
 * @property {(minimum: number, maximum: number) => number} rand
 * @property {SVGPathElement[]} dots
 * @property {SVGCircleElement[]} rings
 * @property {SVGCircleElement[]} parts
 * @property {SVGPathElement[]} glyphs
 * @property {SVGCircleElement[]} thoughtDots
 * @property {SVGGElement} bodyGroup
 * @property {Element} bodyNode
 * @property {Array<[number, number]>} ink
 * @property {number} recvDir
 * @property {number} recvTick
 * @property {number} overlayAt
 * @property {string} primitiveColor
 * @property {string} circlePath
 * @property {string} pencilPath
 * @property {string} bangPath
 * @property {() => void} ensureThoughtDots
 */

/** @typedef {{ amount: number, direction: number, now: number, stateAt: number, radius: number, radiusPx: number, reduce: boolean }} EffectPaintFrame */
/** @typedef {{ now: number, stateAt: number, amount: number, effectAmount: number, reduce: boolean }} EffectSampleFrame */
/** @typedef {{ multiplier: number, dotsAmount?: number, dotPulse?: DotPulse }} ScaleContribution */
/** @typedef {{ xPx?: number, yPx?: number, rollDeg?: number }} OffsetContribution */
/** @typedef {{ id: string, radius?: number, cameraZoom?: number, cycleOn?: number, usesInk?: boolean, paint?: (layer: EffectLayer, frame: EffectPaintFrame) => void, scaleOrder?: number, sampleScale?: (layer: EffectLayer, frame: EffectSampleFrame) => ScaleContribution, offsetOrder?: number, sampleOffset?: (layer: EffectLayer, frame: EffectSampleFrame) => OffsetContribution, sampleOpacity?: (layer: EffectLayer, frame: EffectSampleFrame) => number }} EffectDefinition */
/** @typedef {{ lift: number, pop: number, tone: number }} DotPulse */
/** @typedef {{ dotsAmount: number, dotPulse: DotPulse, xPx: number, yPx: number, rollDeg: number, radiusScale: number, opacityFade: number, radiusPx: number }} FormSample */

export {};
