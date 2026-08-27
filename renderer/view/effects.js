/* 视觉特效组合器。具体公式由 renderer/view/effects/ 下的定义模块提供。 */
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
          for (const key in attrs) node.setAttribute(key, attrs[key]);
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
        dot.setAttribute("cx", "0");
        dot.setAttribute("cy", "0");
        dot.setAttribute("r", "0");
        dot.setAttribute("style", "fill:var(--fg);display:none");
        dot.style.fill = this.primitiveColor;
        this.bodyGroup.insertBefore(dot, this.bodyNode);
        this.thoughtDots.push(dot);
      }
    }

    hideAll() {
      for (const node of this.dots) node.style.display = "none";
      for (const node of this.rings) node.style.display = "none";
      for (const node of this.parts) node.style.display = "none";
      for (const node of this.thoughtDots) node.style.display = "none";
      for (const node of this.glyphs) node.style.display = "none";
    }

    amount(name, current, previous, amount, mix) {
      if (name === current) return amount * mix;
      if (name === previous) return amount * (1 - mix);
      return 0;
    }

    paint(now, stateAt, current, previous, amount, mix, radius, reduce = false) {
      this.hideAll();
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
          now,
          stateAt,
          radius,
          radiusPx,
          reduce,
        });
      }
      for (const ring of this.rings) {
        if (ring.style.display === "") ring.style.stroke = this.primitiveColor;
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
        primitive.style.fill = color;
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
