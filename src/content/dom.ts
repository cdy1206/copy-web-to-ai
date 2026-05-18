import { elementToMarkdown, pageToMarkdown, visibleElementsToMarkdown } from "./markdown";

const ASSISTANT_SELECTORS = [
  '[data-message-author-role="assistant"]',
  '[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
  ".agent-turn",
  ".model-response-text",
  ".markdown.prose",
  ".ds-markdown",
  "[data-response-index]"
];

const MESSAGE_SELECTORS = [
  '[data-message-author-role="user"]',
  '[data-message-author-role="assistant"]',
  '[data-testid^="conversation-turn-"]',
  "article",
  "[role='article']"
];

const CHAT_ROOT_SELECTORS = [
  "main",
  '[role="main"]',
  '[data-testid="conversation-panel"]',
  ".conversation",
  ".chat-container"
];

let lastPointerTarget: Element | null = null;

export function trackPointerTarget(): void {
  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.target instanceof Element) lastPointerTarget = event.target;
    },
    { capture: true, passive: true }
  );
}

export function copyActiveAnswerMarkdown(): string {
  const active = findActiveAnswerElement();
  return active ? elementToMarkdown(active) : "";
}

export function copySelectedAnswerMarkdown(): string {
  const selected = findSelectedAssistantElement();
  return selected ? elementToMarkdown(selected) : "";
}

export function copyVisibleChatMarkdown(): string {
  const messages = findVisibleConversationElements();
  if (messages.length > 0) return visibleElementsToMarkdown(messages);

  const root = findChatRoot();
  return root ? elementToMarkdown(root) : "";
}

export function copyFullPageMarkdown(): string {
  return pageToMarkdown();
}

export function findActiveAnswerElement(): Element | null {
  const selectedMessage = findSelectedAssistantElement();
  if (selectedMessage) return selectedMessage;

  if (lastPointerTarget) {
    const closest = closestAssistantMessage(lastPointerTarget);
    if (closest && isVisible(closest)) return closest;
  }

  return findVisibleMessageElements().at(-1) ?? null;
}

export function findSelectedAssistantElement(): Element | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const candidates = getSelectionCandidateElements(selection);
  for (const element of candidates) {
    const selectedMessage = closestAssistantMessage(element);
    if (selectedMessage && isVisible(selectedMessage)) return selectedMessage;
  }

  return null;
}

export function findVisibleMessageElements(): Element[] {
  const root = findChatRoot() ?? document.body;
  const candidates = uniqueElements(
    ASSISTANT_SELECTORS.flatMap((selector) => safeQueryAll(root, selector))
  );

  const visible = candidates
    .filter((element) => element.textContent?.trim() || element.querySelector("img, canvas, math, .katex, mjx-container"))
    .filter(isVisible);

  if (visible.length > 0) return visible;

  return Array.from(root.querySelectorAll("article, [role='article']")).filter(isVisible);
}

function findVisibleConversationElements(): Element[] {
  const root = findChatRoot() ?? document.body;
  const candidates = uniqueElements(
    MESSAGE_SELECTORS.flatMap((selector) => safeQueryAll(root, selector))
  );
  const visible = candidates
    .filter((element) => element.textContent?.trim() || element.querySelector("img, canvas, math, .katex, mjx-container"))
    .filter(isVisible);
  return visible.length > 0 ? visible : findVisibleMessageElements();
}

function closestAssistantMessage(element: Element): Element | null {
  for (const selector of ASSISTANT_SELECTORS) {
    const closest = safeClosest(element, selector);
    if (closest) return closest;
  }
  return null;
}

function findChatRoot(): Element | null {
  for (const selector of CHAT_ROOT_SELECTORS) {
    const element = document.querySelector(selector);
    if (element && isVisible(element)) return element;
  }
  return document.body;
}

function safeQueryAll(root: Element | Document, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function safeClosest(element: Element, selector: string): Element | null {
  try {
    return element.closest(selector);
  } catch {
    return null;
  }
}

function uniqueElements(elements: Element[]): Element[] {
  const result: Element[] = [];
  for (const element of elements) {
    if (result.some((existing) => existing === element || existing.contains(element))) continue;
    result.push(element);
  }
  return result.sort(compareDocumentOrder);
}

function getSelectionCandidateElements(selection: Selection): Element[] {
  const result: Element[] = [];
  const addNode = (node: Node | null) => {
    const element = node instanceof Element ? node : node?.parentElement ?? null;
    if (element && !result.includes(element)) result.push(element);
  };

  addNode(selection.anchorNode);
  addNode(selection.focusNode);

  for (let index = 0; index < selection.rangeCount; index += 1) {
    addNode(selection.getRangeAt(index).commonAncestorContainer);
  }

  return result;
}

function compareDocumentOrder(left: Element, right: Element): number {
  if (left === right) return 0;
  const position = left.compareDocumentPosition(right);
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  return 0;
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
}
