import { copyActiveAnswerMarkdown, copyFullPageMarkdown, copyVisibleChatMarkdown, trackPointerTarget } from "./dom";
import { findMathRoot, extractMath, wrapLatex } from "./math";
import { selectionToMarkdown } from "./markdown";
import { startOcrRegionSelection, type RegionRect } from "./ocr-region";
import { initializeSelectionToolbar } from "./selection-toolbar";
import { copyText, downloadMarkdownFile, ensureRoot, showToast } from "./ui";
import { isUnlockCopyEnabled, toggleUnlockCopy } from "./unlock";

type RuntimeMessage =
  | { type: "PING_COPY_WEB_TO_AI" }
  | { type: "COPY_SELECTION_MARKDOWN" }
  | { type: "COPY_ACTIVE_ANSWER" }
  | { type: "COPY_VISIBLE_CHAT" }
  | { type: "COPY_FULL_PAGE_MARKDOWN" }
  | { type: "DOWNLOAD_FULL_PAGE_MARKDOWN" }
  | { type: "TOGGLE_UNLOCK_COPY" }
  | { type: "START_REGION_OCR" };

type OcrResponse = { ok: true; markdown: string } | { ok: false; error: string };

declare global {
  interface Window {
    __copyWebToAiLoaded?: boolean;
  }
}

if (!window.__copyWebToAiLoaded) {
  window.__copyWebToAiLoaded = true;
  trackPointerTarget();
  initializeSelectionToolbar();
  initializeFormulaButton();
  initializeMessages();
}

function initializeMessages(): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    handleMessage(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        showToast(message, "error");
        sendResponse({ ok: false, error: message });
      });
    return true;
  });
}

async function handleMessage(message: RuntimeMessage): Promise<Record<string, unknown>> {
  switch (message.type) {
    case "PING_COPY_WEB_TO_AI":
      return { ok: true };
    case "COPY_SELECTION_MARKDOWN":
      return copyMarkdownResult(selectionToMarkdown(), "已复制选区 Markdown");
    case "COPY_ACTIVE_ANSWER":
      return copyMarkdownResult(copyActiveAnswerMarkdown(), "已复制当前回答");
    case "COPY_VISIBLE_CHAT":
      return copyMarkdownResult(copyVisibleChatMarkdown(), "已复制可见会话");
    case "COPY_FULL_PAGE_MARKDOWN":
      return copyMarkdownResult(copyFullPageMarkdown(), "已复制整页 Markdown");
    case "DOWNLOAD_FULL_PAGE_MARKDOWN":
      return downloadMarkdownResult(copyFullPageMarkdown(), "page");
    case "TOGGLE_UNLOCK_COPY": {
      const enabled = toggleUnlockCopy();
      return { ok: true, enabled };
    }
    case "START_REGION_OCR":
      return startRegionOcr();
    default:
      return { ok: false, error: "未知指令" };
  }
}

async function copyMarkdownResult(markdown: string, successMessage: string): Promise<Record<string, unknown>> {
  if (!markdown.trim()) {
    throw new Error("没有找到可复制内容");
  }
  await copyText(markdown);
  showToast(successMessage, "ok");
  return { ok: true, length: markdown.length };
}

async function downloadMarkdownResult(markdown: string, source: string): Promise<Record<string, unknown>> {
  if (!markdown.trim()) {
    throw new Error("没有找到可下载内容");
  }
  const filename = downloadMarkdownFile(markdown, source);
  showToast("Markdown 文件已下载", "ok");
  return { ok: true, length: markdown.length, filename };
}

async function startRegionOcr(): Promise<Record<string, unknown>> {
  showToast("准备框选 OCR 区域", "info");
  const rect = await startOcrRegionSelection();
  if (!rect) return { ok: false, cancelled: true };

  showToast("正在上传到 MinerU OCR...", "info");
  const response = await chrome.runtime.sendMessage({
    type: "RUN_MINERU_OCR",
    rect
  } satisfies { type: "RUN_MINERU_OCR"; rect: RegionRect }) as OcrResponse;

  if (!response.ok) throw new Error(response.error);
  await copyText(response.markdown);
  showToast("OCR 结果已复制", "ok");
  return { ok: true, length: response.markdown.length };
}

async function initializeFormulaButton(): Promise<void> {
  const enabled = await shouldEnableFormulaButton();
  if (!enabled) return;

  const root = ensureRoot();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-web-to-ai-formula-button";
  button.textContent = "复制";
  button.title = "复制 LaTeX";
  button.style.display = "none";
  root.append(button);

  let currentMathElement: Element | null = null;
  let hideTimer: number | null = null;

  const hide = () => {
    button.style.display = "none";
    currentMathElement = null;
  };

  const scheduleHide = () => {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!button.matches(":hover")) hide();
    }, 120);
  };

  document.addEventListener(
    "mouseover",
    (event) => {
      if (isUnlockCopyEnabled()) return;
      const mathElement = findMathRoot(event.target);
      if (!mathElement || mathElement === currentMathElement) return;

      const math = extractMath(mathElement);
      if (!math) return;

      currentMathElement = mathElement;
      const rect = mathElement.getBoundingClientRect();
      const buttonWidth = 54;
      const left = Math.min(window.innerWidth - buttonWidth - 8, Math.max(8, rect.right + 8));
      const top = Math.min(window.innerHeight - 32, Math.max(8, rect.top));
      button.style.left = `${left}px`;
      button.style.top = `${top}px`;
      button.style.display = "block";
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (event) => {
      const targetMath = findMathRoot(event.target);
      const relatedMath = findMathRoot(event.relatedTarget);
      if (targetMath && targetMath !== relatedMath) scheduleHide();
    },
    true
  );

  button.addEventListener("mouseleave", scheduleHide);
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!currentMathElement) return;

    const math = extractMath(currentMathElement);
    if (!math) {
      showToast("没有找到 LaTeX 源码", "error");
      return;
    }

    try {
      await copyText(wrapLatex(math.latex, math.mode));
      button.textContent = "已复制";
      showToast("LaTeX 已复制", "ok");
      window.setTimeout(() => {
        button.textContent = "复制";
      }, 1000);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "复制失败", "error");
    }
  });
}

async function shouldEnableFormulaButton(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get({ enableFormulaButton: true });
    return result.enableFormulaButton !== false;
  } catch {
    return true;
  }
}
