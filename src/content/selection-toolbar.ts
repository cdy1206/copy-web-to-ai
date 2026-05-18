import { copySelectedAnswerMarkdown, findSelectedAssistantElement } from "./dom";
import { selectionToMarkdown } from "./markdown";
import type { RegionRect } from "./ocr-region";
import { copyText, ensureRoot, showToast } from "./ui";

type OcrResponse = { ok: true; markdown: string } | { ok: false; error: string };

interface SelectionInfo {
  rect: DOMRect;
  hasAssistantAnswer: boolean;
}

const MIN_SELECTION_LENGTH = 2;

let toolbar: HTMLElement | null = null;
let updateTimer: number | null = null;
let isInitialized = false;

export function initializeSelectionToolbar(): void {
  if (isInitialized) return;
  isInitialized = true;

  document.addEventListener("selectionchange", scheduleToolbarUpdate);
  document.addEventListener("mouseup", scheduleToolbarUpdate, true);
  document.addEventListener("keyup", (event) => {
    if (["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      scheduleToolbarUpdate();
    }
  });
  document.addEventListener("scroll", hideToolbar, true);
  window.addEventListener("resize", hideToolbar);
  window.addEventListener("blur", hideToolbar);
  scheduleToolbarUpdate();
}

function ensureToolbar(): HTMLElement {
  if (toolbar) return toolbar;

  const root = ensureRoot();
  toolbar = document.createElement("div");
  toolbar.className = "copy-web-to-ai-selection-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Copy Web to AI 选区工具");
  toolbar.innerHTML = `
    <button type="button" data-tool="copy">复制 Markdown</button>
    <button type="button" data-tool="answer">复制当前回答</button>
    <button type="button" data-tool="ocr">OCR</button>
  `;

  toolbar.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  toolbar.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-tool]");
    if (!button) return;
    void handleToolbarAction(button.dataset.tool ?? "");
  });

  root.append(toolbar);
  return toolbar;
}

function scheduleToolbarUpdate(): void {
  if (updateTimer) window.clearTimeout(updateTimer);
  updateTimer = window.setTimeout(updateToolbar, 80);
}

function updateToolbar(): void {
  const info = getSelectionInfo();
  if (!info) {
    hideToolbar();
    return;
  }

  const element = ensureToolbar();
  const answerButton = element.querySelector<HTMLButtonElement>('[data-tool="answer"]');
  if (answerButton) answerButton.hidden = !info.hasAssistantAnswer;

  element.dataset.visible = "true";
  positionToolbar(element, info.rect);
}

function hideToolbar(): void {
  if (updateTimer) {
    window.clearTimeout(updateTimer);
    updateTimer = null;
  }
  toolbar?.removeAttribute("data-visible");
}

async function handleToolbarAction(tool: string): Promise<void> {
  try {
    if (tool === "copy") {
      await copyMarkdown(selectionToMarkdown(), "已复制选区 Markdown");
      return;
    }

    if (tool === "answer") {
      await copyMarkdown(copySelectedAnswerMarkdown(), "已复制当前回答");
      return;
    }

    if (tool === "ocr") {
      await ocrSelection();
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "操作失败", "error");
  }
}

async function copyMarkdown(markdown: string, message: string): Promise<void> {
  if (!markdown.trim()) throw new Error("没有找到可复制内容");
  await copyText(markdown);
  showToast(message, "ok");
  hideToolbar();
}

async function ocrSelection(): Promise<void> {
  const info = getSelectionInfo();
  if (!info) throw new Error("没有可 OCR 的选区");

  const rect: RegionRect = {
    x: info.rect.left,
    y: info.rect.top,
    width: info.rect.width,
    height: info.rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };

  showToast("正在上传选区到 MinerU OCR...", "info");
  const response = await chrome.runtime.sendMessage({
    type: "RUN_MINERU_OCR",
    rect
  } satisfies { type: "RUN_MINERU_OCR"; rect: RegionRect }) as OcrResponse;

  if (!response.ok) throw new Error(response.error);
  await copyText(response.markdown);
  showToast("OCR 结果已复制", "ok");
  hideToolbar();
}

function getSelectionInfo(): SelectionInfo | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  if (selection.toString().trim().length < MIN_SELECTION_LENGTH) return null;
  if (isEditableSelection(selection)) return null;

  const rect = getSelectionRect(selection);
  if (!rect || rect.width < 4 || rect.height < 4) return null;

  return {
    rect,
    hasAssistantAnswer: Boolean(findSelectedAssistantElement())
  };
}

function getSelectionRect(selection: Selection): DOMRect | null {
  const rectangles: DOMRect[] = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    rectangles.push(
      ...Array.from(selection.getRangeAt(index).getClientRects()).filter((rect) => {
        if (rect.width <= 0 || rect.height <= 0) return false;
        if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
        if (rect.right < 0 || rect.left > window.innerWidth) return false;
        return true;
      })
    );
  }
  if (rectangles.length === 0) return null;

  const left = Math.max(0, Math.min(...rectangles.map((rect) => rect.left)));
  const top = Math.max(0, Math.min(...rectangles.map((rect) => rect.top)));
  const right = Math.min(window.innerWidth, Math.max(...rectangles.map((rect) => rect.right)));
  const bottom = Math.min(window.innerHeight, Math.max(...rectangles.map((rect) => rect.bottom)));

  return new DOMRect(left, top, right - left, bottom - top);
}

function isEditableSelection(selection: Selection): boolean {
  const active = document.activeElement;
  if (active && isEditableElement(active)) return true;

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const container = selection.getRangeAt(index).commonAncestorContainer;
    const element = container instanceof Element ? container : container.parentElement;
    if (element && isEditableElement(element)) return true;
  }

  return false;
}

function isEditableElement(element: Element): boolean {
  return Boolean(element.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']"));
}

function positionToolbar(element: HTMLElement, rect: DOMRect): void {
  const width = element.offsetWidth || 260;
  const halfWidth = width / 2;
  const center = rect.left + rect.width / 2;
  const left = clamp(center, halfWidth + 8, window.innerWidth - halfWidth - 8);
  const top = rect.top > 46 ? rect.top - 40 : rect.bottom + 8;

  element.style.left = `${left}px`;
  element.style.top = `${clamp(top, 8, window.innerHeight - 40)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
