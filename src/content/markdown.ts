import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { extractMath, wrapLatex } from "./math";

export function getSelectionHtml(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.toString().trim() === "") return "";

  const container = document.createElement("div");
  for (let index = 0; index < selection.rangeCount; index += 1) {
    container.append(selection.getRangeAt(index).cloneContents());
  }
  return container.innerHTML;
}

export function selectionToMarkdown(): string {
  const html = getSelectionHtml();
  if (!html) return "";
  return htmlToMarkdown(html);
}

export function pageToMarkdown(): string {
  const body = document.body;
  if (!body) return "";

  const metadata = getPageMetadataMarkdown();
  const content = elementToMarkdown(body);
  return [metadata, content].filter(Boolean).join("\n\n---\n\n");
}

export function elementToMarkdown(element: Element): string {
  const clone = element.cloneNode(true);
  if (!(clone instanceof Element)) return "";
  return domToMarkdown(clone);
}

export function visibleElementsToMarkdown(elements: Element[]): string {
  return elements
    .map((element) => elementToMarkdown(element))
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export function htmlToMarkdown(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  return domToMarkdown(container);
}

function domToMarkdown(root: Element): string {
  normalizeMath(root);
  stripNoise(root);
  absolutizeUrls(root);

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*"
  });

  turndown.use(gfm);

  turndown.addRule("latexMarker", {
    filter: (node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).classList.contains("copy-web-to-ai-latex-marker"),
    replacement: (_content, node) => {
      const element = node as Element;
      const latex = element.textContent ?? "";
      const mode = element.getAttribute("data-display-mode");
      return mode === "display" ? `\n\n${latex}\n\n` : latex;
    }
  });

  turndown.addRule("preserveLineBreaks", {
    filter: "br",
    replacement: () => "\n"
  });

  turndown.addRule("disabledTaskCheckbox", {
    filter: (node) =>
      node.nodeName === "INPUT" &&
      (node as HTMLInputElement).type === "checkbox",
    replacement: (_content, node) => {
      const input = node as HTMLInputElement;
      return input.checked ? "[x] " : "[ ] ";
    }
  });

  const markdown = turndown.turndown(root.innerHTML);
  return cleanupMarkdown(markdown);
}

function normalizeMath(root: Element): void {
  const candidates = collectMathCandidates(root);
  for (const element of candidates) {
    if (!root.contains(element)) continue;
    const math = extractMath(element);
    if (!math) continue;

    const marker = document.createElement(math.mode === "display" ? "div" : "span");
    marker.className = "copy-web-to-ai-latex-marker";
    marker.dataset.displayMode = math.mode;
    marker.textContent = wrapLatex(math.latex, math.mode);
    element.replaceWith(marker);
  }
}

function collectMathCandidates(root: Element): Element[] {
  const selector = [
    ".katex-display",
    ".katex",
    "mjx-container",
    ".MathJax_Display",
    ".MJXc-display",
    ".MathJax",
    ".mjx-chtml",
    ".MathJax_CHTML",
    ".MathJax_MathML",
    "[data-math]",
    "math",
    "[data-latex]",
    "[data-tex]",
    "img.mwe-math",
    "img.mwe-math-fallback-image-inline",
    "img.mwe-math-fallback-image-display"
  ].join(",");

  const all = Array.from(root.querySelectorAll(selector));
  return all.filter((element) => !all.some((other) => other !== element && other.contains(element)));
}

function stripNoise(root: Element): void {
  root
    .querySelectorAll(
      [
        "script",
        "style",
        "noscript",
        "template",
        "iframe",
        "object",
        "embed",
        "canvas",
        "[hidden]",
        "[inert]",
        "[aria-hidden='true']",
        "dialog:not([open])",
        "#copy-web-to-ai-ui-root",
        "svg[aria-hidden='true']",
        "[aria-hidden='true'] .katex-html",
        ".katex-html",
        ".katex-mathml",
        "mjx-assistive-mml",
        "[data-testid='copy-turn-action-button']",
        "[data-testid='good-response-turn-action-button']",
        "[data-testid='bad-response-turn-action-button']",
        "button",
        "[role='button'][aria-label*='Copy']",
        "[role='button'][aria-label*='复制']"
      ].join(",")
    )
    .forEach((node) => node.remove());
}

function absolutizeUrls(root: Element): void {
  root.querySelectorAll("a[href]").forEach((link) => {
    try {
      link.setAttribute("href", (link as HTMLAnchorElement).href);
    } catch {
      /* noop */
    }
  });
  root.querySelectorAll("img[src]").forEach((image) => {
    try {
      image.setAttribute("src", (image as HTMLImageElement).src);
    } catch {
      /* noop */
    }
  });
}

function getPageMetadataMarkdown(): string {
  const lines: string[] = [];
  const title = document.title.trim();
  if (title) lines.push(`# ${escapeMarkdownHeading(title)}`);

  const href = window.location.href;
  if (href && !href.startsWith("about:")) lines.push(`Source: ${href}`);

  return lines.join("\n\n");
}

function escapeMarkdownHeading(text: string): string {
  return text.replace(/\s+/g, " ").replace(/^#+\s*/, "");
}

function cleanupMarkdown(markdown: string): string {
  return markdown
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/^(\s*[-*+]) {2,}/gm, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n?(\$\$[\s\S]+?\$\$)\n?/g, "\n\n$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
