type Action =
  | "COPY_SELECTION_MARKDOWN"
  | "COPY_ACTIVE_ANSWER"
  | "COPY_VISIBLE_CHAT"
  | "COPY_FULL_PAGE_MARKDOWN"
  | "TOGGLE_UNLOCK_COPY"
  | "START_REGION_OCR";

export {};

const app = document.getElementById("app");
if (!app) throw new Error("Missing popup root");

app.innerHTML = `
  <section class="panel">
    <header>
      <div>
        <h1>CopyTeX+</h1>
        <p id="host">当前标签页</p>
      </div>
      <button class="icon-button" id="open-options" title="设置" type="button">⚙</button>
    </header>

    <div class="grid">
      <button data-action="COPY_SELECTION_MARKDOWN" type="button">
        <span class="icon">S</span>
        <span>复制选区</span>
      </button>
      <button data-action="COPY_ACTIVE_ANSWER" type="button">
        <span class="icon">A</span>
        <span>复制当前回答</span>
      </button>
      <button data-action="COPY_VISIBLE_CHAT" type="button">
        <span class="icon">M</span>
        <span>复制可见会话</span>
      </button>
      <button data-action="COPY_FULL_PAGE_MARKDOWN" type="button">
        <span class="icon">P</span>
        <span>复制整页</span>
      </button>
      <button data-action="TOGGLE_UNLOCK_COPY" type="button">
        <span class="icon">U</span>
        <span>解锁复制</span>
      </button>
      <button data-action="START_REGION_OCR" class="wide" type="button">
        <span class="icon">O</span>
        <span>框选 OCR</span>
      </button>
    </div>

    <p id="status" role="status"></p>
  </section>
`;

injectStyles();
void hydrateHost();

document.getElementById("open-options")?.addEventListener("click", () => {
  if (!hasExtensionApi()) {
    setStatus("扩展环境中可打开设置", "info");
    return;
  }
  void chrome.runtime.openOptionsPage();
});

document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    const action = button.dataset.action as Action;
    await executeAction(action, button);
  });
});

async function executeAction(action: Action, button: HTMLButtonElement): Promise<void> {
  setStatus("处理中...", "info");
  setBusy(true);
  try {
    if (!hasExtensionApi()) {
      throw new Error("请在已加载的浏览器扩展中使用");
    }
    const response = await chrome.runtime.sendMessage({
      type: "EXECUTE_COPYTEX_ACTION",
      action
    });
    if (!response?.ok) {
      const cancelled = response?.cancelled;
      if (cancelled) setStatus("已取消", "info");
      else throw new Error(response?.error || "操作失败");
    } else {
      setStatus(action === "TOGGLE_UNLOCK_COPY" ? "已切换" : "已发送到页面", "ok");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(false);
    button.focus();
  }
}

async function hydrateHost(): Promise<void> {
  if (!hasExtensionApi()) {
    const hostElement = document.getElementById("host");
    if (hostElement) hostElement.textContent = "预览模式";
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = tab?.url ? new URL(tab.url).hostname : "当前标签页";
  const hostElement = document.getElementById("host");
  if (hostElement) hostElement.textContent = host;
}

function setStatus(message: string, tone: "ok" | "error" | "info"): void {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function setBusy(isBusy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = isBusy;
  });
}

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f7f7f8;
      color: #1d1d20;
    }

    body {
      width: 320px;
      margin: 0;
      background: #f7f7f8;
    }

    .panel {
      padding: 14px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    h1 {
      margin: 0;
      font-size: 16px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    p {
      margin: 0;
    }

    #host {
      margin-top: 3px;
      max-width: 236px;
      overflow: hidden;
      color: #63636b;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 42px;
      border: 1px solid #d8d8df;
      border-radius: 8px;
      background: #ffffff;
      color: #202026;
      cursor: pointer;
      font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    button:hover {
      border-color: #9ca3af;
      background: #fdfdfd;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.58;
    }

    .icon-button {
      width: 32px;
      min-height: 32px;
      padding: 0;
    }

    .wide {
      grid-column: 1 / -1;
    }

    .icon {
      display: inline-grid;
      place-items: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ececf1;
      color: #34343a;
      font-size: 11px;
      font-weight: 700;
    }

    #status {
      min-height: 18px;
      margin-top: 10px;
      color: #63636b;
      font-size: 12px;
      line-height: 1.4;
    }

    #status[data-tone="ok"] {
      color: #17633a;
    }

    #status[data-tone="error"] {
      color: #b42318;
    }

    @media (prefers-color-scheme: dark) {
      :root,
      body {
        background: #17181c;
        color: #f4f4f5;
      }

      #host,
      #status {
        color: #a3a3aa;
      }

      button {
        border-color: #393a42;
        background: #22232a;
        color: #f4f4f5;
      }

      button:hover {
        border-color: #666977;
        background: #292a32;
      }

      .icon {
        background: #343640;
        color: #f4f4f5;
      }

      #status[data-tone="ok"] {
        color: #6ee7a4;
      }

      #status[data-tone="error"] {
        color: #fda29b;
      }
    }
  `;
  document.head.append(style);
}

function hasExtensionApi(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}
