import { describe, expect, it } from "vitest";
import { convertUnicodeMathToLatex, extractMath, wrapLatex } from "../src/content/math";

function elementFromHtml(html: string): Element {
  const container = document.createElement("div");
  container.innerHTML = html.trim();
  const element = container.firstElementChild;
  if (!element) throw new Error("Missing fixture element");
  document.body.append(container);
  return element;
}

describe("math extraction", () => {
  it("extracts KaTeX annotations", () => {
    const element = elementFromHtml(`
      <span class="katex">
        <span class="katex-mathml">
          <math><semantics><annotation encoding="application/x-tex">x^2 + y^2</annotation></semantics></math>
        </span>
      </span>
    `);

    expect(extractMath(element)).toMatchObject({
      latex: "x^2 + y^2",
      source: "katex"
    });
  });

  it("extracts MathJax sibling scripts", () => {
    const wrapper = elementFromHtml(`
      <div>
        <span class="MathJax" id="MathJax-Element-1"></span>
        <script type="math/tex">\\alpha + \\beta</script>
      </div>
    `);
    const element = wrapper.querySelector(".MathJax");
    expect(element).toBeTruthy();

    expect(extractMath(element!)).toMatchObject({
      latex: "\\alpha + \\beta",
      source: "mathjax-script-sibling"
    });
  });

  it("extracts MathJax display mode", () => {
    const element = elementFromHtml(`
      <mjx-container display="true">
        <script type="math/tex; mode=display">\\int_0^1 x dx</script>
      </mjx-container>
    `);

    expect(extractMath(element)).toMatchObject({
      latex: "\\int_0^1 x dx",
      mode: "display"
    });
  });

  it("extracts Gemini data-math", () => {
    const element = elementFromHtml(`<span data-math="e^{i\\pi}+1=0"></span>`);

    expect(extractMath(element)).toMatchObject({
      latex: "e^{i\\pi}+1=0",
      source: "data-math"
    });
  });

  it("extracts MathML TeX annotation", () => {
    const element = elementFromHtml(`
      <math><semantics><mrow></mrow><annotation encoding="application/x-tex">\\frac{a}{b}</annotation></semantics></math>
    `);

    expect(extractMath(element)).toMatchObject({
      latex: "\\frac{a}{b}",
      source: "mathml-annotation"
    });
  });

  it("extracts data-latex attributes", () => {
    const element = elementFromHtml(`<span data-latex="\\sqrt{x}"></span>`);

    expect(extractMath(element)).toMatchObject({
      latex: "\\sqrt{x}",
      source: "attribute"
    });
  });

  it("converts common unicode math fallback", () => {
    expect(convertUnicodeMathToLatex("π ≤ θ²")).toBe("\\pi \\leq \\theta^{2}");
  });

  it("wraps display math", () => {
    expect(wrapLatex("\\sum_i x_i", "display")).toBe("$$\\sum_i x_i$$");
  });
});
