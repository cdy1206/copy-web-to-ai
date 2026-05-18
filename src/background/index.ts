import { runMineruOcr, type MineruSettings } from "./mineru";

type ContentAction =
  | "COPY_SELECTION_MARKDOWN"
  | "COPY_ACTIVE_ANSWER"
  | "COPY_VISIBLE_CHAT"
  | "COPY_FULL_PAGE_MARKDOWN"
  | "DOWNLOAD_FULL_PAGE_MARKDOWN"
  | "TOGGLE_UNLOCK_COPY"
  | "START_REGION_OCR";

type BackgroundMessage =
  | { type: "RUN_MINERU_OCR"; rect: RegionRect }
  | { type: "EXECUTE_COPY_WEB_TO_AI_ACTION"; action: ContentAction }
  | { type: "ACTIVATE_COPY_WEB_TO_AI_PAGE" };

interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

const MENU_IDS: Record<string, ContentAction> = {
  "copy-web-to-ai-copy-selection": "COPY_SELECTION_MARKDOWN",
  "copy-web-to-ai-copy-answer": "COPY_ACTIVE_ANSWER",
  "copy-web-to-ai-copy-visible-chat": "COPY_VISIBLE_CHAT",
  "copy-web-to-ai-copy-full-page": "COPY_FULL_PAGE_MARKDOWN",
  "copy-web-to-ai-download-full-page": "DOWNLOAD_FULL_PAGE_MARKDOWN",
  "copy-web-to-ai-unlock-copy": "TOGGLE_UNLOCK_COPY",
  "copy-web-to-ai-ocr-region": "START_REGION_OCR"
};

chrome.runtime.onInstalled.addListener(() => {
  void createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void createContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const action = MENU_IDS[String(info.menuItemId)];
  if (!action || !tab?.id) return;
  void runActionInTab(tab.id, action);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "copy-selection-markdown") {
    void runActionInActiveTab("COPY_SELECTION_MARKDOWN");
  }
  if (command === "ocr-region") {
    void runActionInActiveTab("START_REGION_OCR");
  }
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  return true;
});

async function handleMessage(message: BackgroundMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (message.type === "RUN_MINERU_OCR") {
    if (!sender.tab?.windowId) throw new Error("无法定位当前标签页");
    const settings = await getMineruSettings();
    const screenshot = await captureVisibleTab(sender.tab.windowId);
    const cropped = await cropScreenshot(screenshot, message.rect);
    const markdown = await runMineruOcr(cropped, settings);
    return { ok: true, markdown };
  }

  if (message.type === "EXECUTE_COPY_WEB_TO_AI_ACTION") {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("没有可操作的标签页");
    return runActionInTab(tab.id, message.action);
  }

  if (message.type === "ACTIVATE_COPY_WEB_TO_AI_PAGE") {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("没有可操作的标签页");
    await ensureContentScript(tab.id);
    return { ok: true };
  }

  return { ok: false, error: "未知 background 指令" };
}

async function runActionInActiveTab(action: ContentAction): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await runActionInTab(tab.id, action);
}

async function runActionInTab(tabId: number, action: ContentAction): Promise<unknown> {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, { type: action });
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING_COPY_WEB_TO_AI" });
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    await sleep(80);
  }
}

async function createContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "copy-web-to-ai-copy-selection",
    title: "Copy Web to AI: 复制选区为 Markdown/LaTeX",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "copy-web-to-ai-copy-answer",
    title: "Copy Web to AI: 复制当前回答",
    contexts: ["page", "selection"]
  });
  chrome.contextMenus.create({
    id: "copy-web-to-ai-copy-visible-chat",
    title: "Copy Web to AI: 复制可见会话",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "copy-web-to-ai-copy-full-page",
    title: "Copy Web to AI: 复制整页为 Markdown/LaTeX",
    contexts: ["page", "selection"]
  });
  chrome.contextMenus.create({
    id: "copy-web-to-ai-download-full-page",
    title: "Copy Web to AI: 下载整页 Markdown",
    contexts: ["page", "selection"]
  });
  chrome.contextMenus.create({
    id: "copy-web-to-ai-unlock-copy",
    title: "Copy Web to AI: 临时解锁当前页复制",
    contexts: ["page", "selection"]
  });
  chrome.contextMenus.create({
    id: "copy-web-to-ai-ocr-region",
    title: "Copy Web to AI: 框选 MinerU OCR",
    contexts: ["page", "image", "selection"]
  });
}

async function captureVisibleTab(windowId: number): Promise<string> {
  return chrome.tabs.captureVisibleTab(windowId, {
    format: "png"
  });
}

async function cropScreenshot(dataUrl: string, rect: RegionRect): Promise<Blob> {
  const imageBlob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(imageBlob);
  const scaleX = bitmap.width / rect.viewportWidth;
  const scaleY = bitmap.height / rect.viewportHeight;

  const sx = clamp(Math.round(rect.x * scaleX), 0, bitmap.width - 1);
  const sy = clamp(Math.round(rect.y * scaleY), 0, bitmap.height - 1);
  const sw = clamp(Math.round(rect.width * scaleX), 1, bitmap.width - sx);
  const sh = clamp(Math.round(rect.height * scaleY), 1, bitmap.height - sy);

  const canvas = new OffscreenCanvas(sw, sh);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持截图裁剪");
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.convertToBlob({ type: "image/png" });
}

async function getMineruSettings(): Promise<MineruSettings> {
  const result = await chrome.storage.local.get({
    mineruToken: "",
    mineruUserId: "",
    ocrLanguage: "ch",
    ocrTimeoutSeconds: 180
  });

  return {
    mineruToken: String(result.mineruToken ?? ""),
    mineruUserId: String(result.mineruUserId ?? ""),
    ocrLanguage: String(result.ocrLanguage ?? "ch"),
    ocrTimeoutSeconds: Number(result.ocrTimeoutSeconds ?? 180)
  };
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
