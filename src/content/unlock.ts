import { showToast } from "./ui";

const STYLE_ID = "copy-web-to-ai-unlock-style";

let enabled = false;

const EVENTS = [
  "copy",
  "cut",
  "selectstart",
  "selectionchange",
  "contextmenu",
  "mousedown",
  "mouseup",
  "dragstart"
] as const;

export function toggleUnlockCopy(): boolean {
  enabled = !enabled;
  if (enabled) enableUnlockCopy();
  else disableUnlockCopy();
  return enabled;
}

export function isUnlockCopyEnabled(): boolean {
  return enabled;
}

function enableUnlockCopy(): void {
  injectStyle();
  for (const event of EVENTS) {
    document.addEventListener(event, stopPageBlockers, true);
  }
  showToast("已临时解锁当前页面复制", "ok");
}

function disableUnlockCopy(): void {
  document.getElementById(STYLE_ID)?.remove();
  for (const event of EVENTS) {
    document.removeEventListener(event, stopPageBlockers, true);
  }
  showToast("已关闭解锁复制", "info");
}

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html, body, body * {
      user-select: text !important;
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
    }
  `;
  document.documentElement.append(style);
}

function stopPageBlockers(event: Event): void {
  if (!enabled) return;
  const target = event.target;
  if (target instanceof Element && target.closest("#copy-web-to-ai-ui-root")) return;

  event.stopImmediatePropagation();

  if (event.type === "copy") {
    const text = window.getSelection()?.toString() ?? "";
    if (!text.trim()) return;
    const clipboardEvent = event as ClipboardEvent;
    clipboardEvent.clipboardData?.setData("text/plain", text);
    if (clipboardEvent.clipboardData) event.preventDefault();
  }
}
