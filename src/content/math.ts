export type MathDisplayMode = "inline" | "display";

export interface ExtractedMath {
  latex: string;
  mode: MathDisplayMode;
  source: string;
}

const GREEK_AND_SYMBOLS: Array<[RegExp, string]> = [
  [/α/g, "\\alpha"],
  [/β/g, "\\beta"],
  [/γ/g, "\\gamma"],
  [/δ/g, "\\delta"],
  [/ε/g, "\\varepsilon"],
  [/θ/g, "\\theta"],
  [/λ/g, "\\lambda"],
  [/μ/g, "\\mu"],
  [/π/g, "\\pi"],
  [/σ/g, "\\sigma"],
  [/φ/g, "\\varphi"],
  [/ω/g, "\\omega"],
  [/∞/g, "\\infty"],
  [/∑/g, "\\sum"],
  [/∫/g, "\\int"],
  [/√/g, "\\sqrt"],
  [/±/g, "\\pm"],
  [/×/g, "\\times"],
  [/÷/g, "\\div"],
  [/≤/g, "\\leq"],
  [/≥/g, "\\geq"],
  [/≠/g, "\\neq"],
  [/≈/g, "\\approx"],
  [/²/g, "^2"],
  [/³/g, "^3"]
];

export function isMathElement(element: Element | null): boolean {
  if (!element) return false;

  if (element.matches("math, mjx-container, [data-math], [data-latex], [data-tex]")) {
    return true;
  }

  if (
    element.matches(
      ".katex, .katex-display, .MathJax, .MathJax_Display, .MathJax_CHTML, .MathJax_MathML, .mjx-chtml, .MJXc-display"
    )
  ) {
    return true;
  }

  const className = normalizeClassName(element);
  return /\b(math-|equation|formula)\b/.test(className);
}

export function findMathRoot(target: EventTarget | Element | null): Element | null {
  if (!(target instanceof Element)) return null;

  const direct = target.closest(
    ".katex, .katex-display, mjx-container, .MathJax_Display, .MJXc-display, .MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML, [data-math], math, [data-latex], [data-tex]"
  );
  if (direct) return direct;

  let current: Element | null = target;
  let outermost: Element | null = null;
  for (let depth = 0; current && depth < 20; depth += 1) {
    if (isMathElement(current)) outermost = current;
    current = current.parentElement;
  }
  return outermost;
}

export function extractMath(element: Element): ExtractedMath | null {
  const wikipedia = extractWikipediaMath(element);
  if (wikipedia) return wikipedia;

  const dataMath = getAttributeLatex(element, ["data-math"]);
  if (dataMath) {
    return {
      latex: dataMath,
      mode: getDisplayMode(element),
      source: "data-math"
    };
  }

  const katex = extractKaTeX(element);
  if (katex) return katex;

  const mathJax = extractMathJax(element);
  if (mathJax) return mathJax;

  const mathMl = extractMathMl(element);
  if (mathMl) return mathMl;

  const attrs = getAttributeLatex(element, ["data-latex", "data-tex", "aria-label", "title"]);
  if (attrs) {
    return {
      latex: attrs,
      mode: getDisplayMode(element),
      source: "attribute"
    };
  }

  const text = element.textContent?.trim() ?? "";
  if (!text) return null;

  const delimited = unwrapDelimiters(text);
  if (delimited) {
    return {
      latex: delimited.latex,
      mode: delimited.mode,
      source: "delimited-text"
    };
  }

  const converted = convertUnicodeMathToLatex(text);
  if (converted !== text) {
    return {
      latex: converted,
      mode: getDisplayMode(element),
      source: "unicode-fallback"
    };
  }

  return null;
}

export function delimiterFor(mode: MathDisplayMode): "$" | "$$" {
  return mode === "display" ? "$$" : "$";
}

export function wrapLatex(latex: string, mode: MathDisplayMode): string {
  const delimiter = delimiterFor(mode);
  return `${delimiter}${latex.trim()}${delimiter}`;
}

export function convertUnicodeMathToLatex(text: string): string {
  let latex = text;
  for (const [pattern, replacement] of GREEK_AND_SYMBOLS) {
    latex = latex.replace(pattern, replacement);
  }
  latex = latex.replace(/(\b\w+)\^(\w+)/g, "$1^{$2}");
  latex = latex.replace(/\be\s*i\s*(\\pi|\\theta|[a-zA-Z]+)/g, "e^{i$1}");
  return latex;
}

export function getDisplayMode(element: Element): MathDisplayMode {
  if (
    element.matches(".katex-display, .MathJax_Display, .MJXc-display") ||
    (element.tagName.toLowerCase() === "mjx-container" && element.hasAttribute("display"))
  ) {
    return "display";
  }

  if (element.matches("img.mwe-math-fallback-image-display")) return "display";

  const parent = element.parentElement;
  if (parent?.classList.contains("katex-display")) return "display";

  if (element.hasAttribute("data-math")) {
    return element.tagName.toLowerCase() === "div" ? "display" : "inline";
  }

  const style = safeComputedStyle(element);
  if (style && style.display === "block") return "display";

  return "inline";
}

function extractKaTeX(element: Element): ExtractedMath | null {
  const katex = element.closest(".katex") ?? (element.matches(".katex-display") ? element.querySelector(".katex") : null);
  if (!katex) return null;

  const annotation = katex.querySelector(
    'annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"], annotation[encoding="application/tex"]'
  );
  const latex = annotation?.textContent?.trim() || getAttributeLatex(katex, ["data-latex", "data-tex", "aria-label", "title"]);
  if (!latex) return null;

  return {
    latex,
    mode: getDisplayMode(katex),
    source: "katex"
  };
}

function extractMathJax(element: Element): ExtractedMath | null {
  const mathJax = element.closest(
    "mjx-container, .MathJax_Display, .MJXc-display, .MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML"
  );
  if (!mathJax) return null;

  const ownScript = mathJax.querySelector('script[type*="math/tex"]');
  if (ownScript?.textContent?.trim()) {
    return {
      latex: ownScript.textContent.trim(),
      mode: getDisplayMode(mathJax),
      source: "mathjax-script-child"
    };
  }

  const siblingScript = findMathScriptSibling(mathJax);
  if (siblingScript?.textContent?.trim()) {
    return {
      latex: siblingScript.textContent.trim(),
      mode: siblingScript.type.includes("mode=display") ? "display" : getDisplayMode(mathJax),
      source: "mathjax-script-sibling"
    };
  }

  const assistive = mathJax.querySelector("mjx-assistive-mml annotation");
  if (assistive?.textContent?.trim()) {
    return {
      latex: assistive.textContent.trim(),
      mode: getDisplayMode(mathJax),
      source: "mathjax-assistive"
    };
  }

  const attrs = getAttributeLatex(mathJax, ["data-latex", "data-tex", "aria-label", "title"]);
  if (attrs) {
    return {
      latex: attrs,
      mode: getDisplayMode(mathJax),
      source: "mathjax-attribute"
    };
  }

  return null;
}

function extractMathMl(element: Element): ExtractedMath | null {
  const math = element.closest("math") ?? element.querySelector("math");
  if (!math) return null;

  const annotation = math.querySelector(
    'annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"], annotation[encoding="application/tex"]'
  );
  if (annotation?.textContent?.trim()) {
    return {
      latex: annotation.textContent.trim(),
      mode: getDisplayMode(math),
      source: "mathml-annotation"
    };
  }

  return null;
}

function extractWikipediaMath(element: Element): ExtractedMath | null {
  if (!(element instanceof HTMLImageElement)) return null;
  if (
    !element.matches(
      "img.mwe-math, img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display"
    )
  ) {
    return null;
  }

  const alt = element.getAttribute("alt")?.trim();
  if (!alt) return null;

  const display = alt.match(/^\{\\displaystyle\s*([\s\S]*?)\}$/);
  return {
    latex: (display?.[1] ?? alt).trim(),
    mode: getDisplayMode(element),
    source: "wikipedia-alt"
  };
}

function getAttributeLatex(element: Element, names: string[]): string | null {
  for (const name of names) {
    const value = element.getAttribute(name)?.trim();
    if (!value) continue;
    if (name === "data-math" || value.includes("\\") || /[$^_{}]/.test(value)) return value;
  }
  return null;
}

function findMathScriptSibling(element: Element): HTMLScriptElement | null {
  let current: Element | null = element;
  for (let i = 0; current && i < 8; i += 1) {
    current = current.nextElementSibling;
    if (current instanceof HTMLScriptElement && current.type.includes("math/tex")) return current;
  }
  current = element;
  for (let i = 0; current && i < 4; i += 1) {
    current = current.previousElementSibling;
    if (current instanceof HTMLScriptElement && current.type.includes("math/tex")) return current;
  }
  return null;
}

function unwrapDelimiters(text: string): { latex: string; mode: MathDisplayMode } | null {
  if (text.startsWith("$$") && text.endsWith("$$") && text.length > 4) {
    return { latex: text.slice(2, -2).trim(), mode: "display" };
  }
  if (text.startsWith("\\[") && text.endsWith("\\]") && text.length > 4) {
    return { latex: text.slice(2, -2).trim(), mode: "display" };
  }
  if (text.startsWith("$") && text.endsWith("$") && text.length > 2) {
    return { latex: text.slice(1, -1).trim(), mode: "inline" };
  }
  if (text.startsWith("\\(") && text.endsWith("\\)") && text.length > 4) {
    return { latex: text.slice(2, -2).trim(), mode: "inline" };
  }
  return null;
}

function normalizeClassName(element: Element): string {
  const className = element.className;
  if (typeof className === "string") return className;
  if (className && typeof (className as SVGAnimatedString).baseVal === "string") {
    return (className as SVGAnimatedString).baseVal;
  }
  return "";
}

function safeComputedStyle(element: Element): CSSStyleDeclaration | null {
  try {
    return window.getComputedStyle(element);
  } catch {
    return null;
  }
}
