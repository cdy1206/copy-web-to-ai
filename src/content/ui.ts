const ROOT_ID = "copy-web-to-ai-ui-root";

let toastTimer: number | null = null;

export async function copyText(text: string): Promise<void> {
  if (!text.trim()) throw new Error("没有可复制的内容");

  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.setAttribute("readonly", "true");
    document.body.append(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) throw new Error("剪贴板写入失败");
  }
}

export function downloadMarkdownFile(markdown: string, source: string): string {
  if (!markdown.trim()) throw new Error("没有可下载的内容");

  const filename = buildMarkdownFilename(source);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return filename;
}

export function showToast(message: string, tone: "ok" | "error" | "info" = "info"): void {
  const root = ensureRoot();
  let toast = root.querySelector<HTMLElement>(".copy-web-to-ai-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "copy-web-to-ai-toast";
    root.append(toast);
  }

  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.dataset.visible = "true";

  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast?.removeAttribute("data-visible");
  }, 2200);
}

export function ensureRoot(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = ROOT_ID;
  document.documentElement.append(root);

  const style = document.createElement("style");
  style.textContent = `
    #${ROOT_ID} {
      all: initial;
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
    }

    #${ROOT_ID} .copy-web-to-ai-toast {
      position: fixed;
      left: 50%;
      bottom: 28px;
      transform: translateX(-50%) translateY(12px);
      max-width: min(420px, calc(100vw - 32px));
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(28, 28, 32, 0.94);
      color: #fff;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.24);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease, transform 160ms ease;
      white-space: normal;
    }

    #${ROOT_ID} .copy-web-to-ai-toast[data-visible="true"] {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    #${ROOT_ID} .copy-web-to-ai-toast[data-tone="ok"] {
      background: rgba(28, 116, 64, 0.96);
    }

    #${ROOT_ID} .copy-web-to-ai-toast[data-tone="error"] {
      background: rgba(178, 45, 45, 0.96);
    }

    #${ROOT_ID} .copy-web-to-ai-formula-button {
      position: fixed;
      min-width: 48px;
      height: 28px;
      padding: 0 10px;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 8px;
      background: rgba(25, 27, 32, 0.94);
      color: #fff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      font: 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
      pointer-events: auto;
    }

    #${ROOT_ID} .copy-web-to-ai-selection-toolbar {
      position: fixed;
      display: flex;
      gap: 6px;
      align-items: center;
      min-height: 32px;
      padding: 5px;
      border: 1px solid rgba(255, 255, 255, 0.20);
      border-radius: 8px;
      background: rgba(25, 27, 32, 0.96);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
      opacity: 0;
      pointer-events: none;
      transform: translateX(-50%) translateY(4px);
      transition: opacity 120ms ease, transform 120ms ease;
    }

    #${ROOT_ID} .copy-web-to-ai-selection-toolbar[data-visible="true"] {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }

    #${ROOT_ID} .copy-web-to-ai-selection-toolbar button {
      min-width: 0;
      min-height: 28px;
      margin: 0;
      padding: 0 9px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #fff;
      cursor: pointer;
      font: 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      white-space: nowrap;
      pointer-events: auto;
    }

    #${ROOT_ID} .copy-web-to-ai-selection-toolbar button:hover {
      background: rgba(255, 255, 255, 0.14);
    }

    #${ROOT_ID} .copy-web-to-ai-selection-toolbar button[hidden] {
      display: none;
    }

    #${ROOT_ID} .copy-web-to-ai-ocr-layer {
      position: fixed;
      inset: 0;
      cursor: crosshair;
      background: rgba(0, 0, 0, 0.16);
      pointer-events: auto;
    }

    #${ROOT_ID} .copy-web-to-ai-ocr-box {
      position: fixed;
      border: 2px solid #ffffff;
      background: rgba(59, 130, 246, 0.18);
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.20);
    }

    #${ROOT_ID} .copy-web-to-ai-ocr-hint {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(25, 27, 32, 0.94);
      color: #fff;
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
    }
  `;
  root.append(style);
  return root;
}

function buildMarkdownFilename(source: string): string {
  const title = document.title.trim() || source || "copy-web-to-ai";
  const safeTitle = title
    .replace(/[\\/:*?"<>|#]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${safeTitle || "copy-web-to-ai"}-${stamp}.md`;
}
