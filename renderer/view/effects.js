/* 视觉特效组合器。具体公式由 renderer/view/effects/ 下的定义模块提供。 */
import { setAttribute, setStyle } from "./dom.js";
import { create as createCatalog } from "./effects/catalog.js";
import { create as createFormSampler } from "./effects/form-sampler.js";

function create(dependencies) {
  const NS = "http://www.w3.org/2000/svg";
  const catalog = createCatalog(dependencies);
  const sampleForm = createFormSampler({
    data: dependencies.data,
    definitions: catalog.definitions,
  });

  class OverlayLayer {
    constructor(options) {
      const doc = options.document;
      const random = options.random;
      const make = (tag, attrs) => {
        const node = doc.createElementNS(NS, tag);
        if (attrs)
          for (const key in attrs) setAttribute(node, key, attrs[key]);
        return node;
      };
      this.rand = options.rand;
      this.uid = `fx-${random().toString(36).slice(2, 8)}`;
      this.back = make("g", { "aria-hidden": "true" });
      this.front = make("g", { "aria-hidden": "true" });
      this.dots = [0, 1].map(() =>
        make("path", { style: "fill:var(--fg);display:none" }),
      );
      this.rings = [0, 1, 2, 3, 4, 5, 6].map(() =>
        make("circle", {
          cx: "0",
          cy: "0",
          r: "0",
          fill: "none",
          style: "display:none;stroke:var(--fg)",
        }),
      );
      this.parts = [0, 1, 2, 3, 4, 5, 6].map(() =>
        make("circle", {
          cx: "0",
          cy: "0",
          r: "0",
          style: "fill:var(--fg);display:none",
        }),
      );
      this.document = doc;
      this.bodyGroup = null;
      this.bodyNode = null;
      this.thoughtDots = [];
      this.glyphs = [0, 1, 2].map(() =>
        make("path", { style: "display:none" }),
      );
      this.ink = [];
      this.recvDir = -0.7;
      this.recvTick = -1;
      this.overlayAt = 0;
      this.primitiveColor = "var(--fg)";
      this.circlePath = "";
      this.pencilPath = "";
      this.bangPath = "";
      this._reduce = false;
      this.visible = new Set();
    }

    attach(svg, bodyGroup) {
      this.bodyGroup = bodyGroup;
      this.bodyNode = bodyGroup.children[0];
      svg.appendChild(this.back);
      this.dots.forEach((node) => svg.appendChild(node));
      this.rings.forEach((node) => svg.appendChild(node));
      this.parts.forEach((node) => svg.appendChild(node));
      this.glyphs.forEach((node) => svg.appendChild(node));
      svg.appendChild(bodyGroup);
      svg.appendChild(this.front);
    }

    ensureThoughtDots() {
      while (this.thoughtDots.length < 3) {
        const dot = this.document.createElementNS(NS, "circle");
        setAttribute(dot, "cx", "0");
        setAttribute(dot, "cy", "0");
        setAttribute(dot, "r", "0");
        setAttribute(dot, "style", "fill:var(--fg);display:none");
        setStyle(dot, "fill", this.primitiveColor);
        this.bodyGroup.insertBefore(dot, this.bodyNode);
        this.thoughtDots.push(dot);
      }
    }

    hideAll() {
      this.visible.clear();
      this.commitVisibility();
    }

    setVisible(node, visible) {
      if (visible) this.visible.add(node);
      else this.visible.delete(node);
    }

    commitVisibility() {
      for (const nodes of [
        this.dots, this.rings, this.parts, this.thoughtDots, this.glyphs,
      ]) {
        for (const node of nodes)
          setStyle(node, "display", this.visible.has(node) ? "" : "none");
      }
      for (const ring of this.rings) {
        if (this.visible.has(ring)) setStyle(ring, "stroke", this.primitiveColor);
      }
    }

    amount(name, current, previous, amount, mix) {
      if (name === current) return amount * mix;
      if (name === previous) return amount * (1 - mix);
      return 0;
    }

    paint(
      now,
      stateAt,
      current,
      previous,
      amount,
      mix,
      radius,
      direction,
      reduce = false,
    ) {
      this.visible.clear();
      this._reduce = reduce;
      const radiusPx = catalog.radiusFor(current, previous, mix);
      for (const definition of catalog.ordered) {
        if (!definition.paint) continue;
        const effectAmount = this.amount(
          definition.id,
          current,
          previous,
          amount,
          mix,
        );
        if (effectAmount <= 0.004) continue;
        definition.paint(this, {
          amount: effectAmount,
          direction,
          now,
          stateAt,
          radius,
          radiusPx,
          reduce,
        });
      }
    }

    thoughtBumps(now, stateAt, current, previous, amount, mix, radius, reduce) {
      return catalog.thoughtBumps(
        now,
        stateAt,
        this.amount("thought-pulse", current, previous, amount, mix),
        radius,
        reduce,
      );
    }

    sampleForm(now, stateAt, current, previous, amount, mix) {
      return sampleForm(
        this,
        now,
        stateAt,
        current,
        previous,
        amount,
        mix,
        this._reduce,
      );
    }

    setPrimitiveColor(color) {
      this.primitiveColor = color;
      for (const primitive of [
        ...this.dots,
        ...this.parts,
        ...this.thoughtDots,
      ])
        setStyle(primitive, "fill", color);
    }

    resetInk() {
      this.ink = [];
    }
  }

  return Object.freeze({
    CYCLE: catalog.CYCLE,
    CYCLE_ON: catalog.CYCLE_ON,
    CYCLE_OFF: catalog.CYCLE_OFF,
    FORM_MORPH_THRESHOLD: catalog.FORM_MORPH_THRESHOLD,
    PRESERVE_INK: catalog.PRESERVE_INK,
    OverlayLayer,
    cameraZoomFor: catalog.cameraZoomFor,
    registries: catalog.registries,
  });
}

export { create };
