interface Settings {
  mineruToken: string;
  mineruUserId: string;
  ocrLanguage: string;
  ocrTimeoutSeconds: number;
  allowAllSites: boolean;
  enableFormulaButton: boolean;
}

export {};

const app = document.getElementById("app");
if (!app) throw new Error("Missing options root");

app.innerHTML = `
  <section class="shell">
    <header>
      <h1>Copy Web to AI 设置</h1>
      <p>Token 只保存在本机浏览器的 local storage。</p>
    </header>

    <form id="settings-form">
      <label>
        <span>MinerU Token</span>
        <input id="mineru-token" name="mineruToken" type="password" autocomplete="off" spellcheck="false" />
      </label>

      <label>
        <span>MinerU 用户标识（可选）</span>
        <input id="mineru-user-id" name="mineruUserId" type="text" autocomplete="off" spellcheck="false" placeholder="留空时自动从 JWT uuid 读取" />
      </label>

      <div class="row">
        <label>
          <span>OCR 语言</span>
          <input id="ocr-language" name="ocrLanguage" type="text" value="ch" />
        </label>

        <label>
          <span>OCR 超时秒数</span>
          <input id="ocr-timeout" name="ocrTimeoutSeconds" type="number" min="30" max="600" step="10" />
        </label>
      </div>

      <label class="check">
        <input id="enable-formula-button" name="enableFormulaButton" type="checkbox" />
        <span>启用公式悬浮复制按钮</span>
      </label>

      <label class="check">
        <input id="allow-all-sites" name="allowAllSites" type="checkbox" />
        <span>允许快捷键和右键菜单在所有网站按需注入</span>
      </label>

      <div class="actions">
        <button type="submit">保存设置</button>
      </div>
    </form>

    <p id="status" role="status"></p>
  </section>
`;

injectStyles();
void loadSettings();

document.getElementById("settings-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
});

document.getElementById("allow-all-sites")?.addEventListener("change", async (event) => {
  const checkbox = event.currentTarget as HTMLInputElement;
  if (!hasExtensionApi()) {
    checkbox.checked = false;
    setStatus("请在已加载的浏览器扩展中授权", "error");
    return;
  }
  if (checkbox.checked) {
    const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    if (!granted) {
      checkbox.checked = false;
      setStatus("浏览器未授予所有网站权限", "error");
    }
  } else {
    await chrome.permissions.remove({ origins: ["<all_urls>"] });
  }
});

async function loadSettings(): Promise<void> {
  if (!hasExtensionApi()) {
    const defaults: Settings = {
      mineruToken: "",
      mineruUserId: "",
      ocrLanguage: "ch",
      ocrTimeoutSeconds: 180,
      allowAllSites: false,
      enableFormulaButton: true
    };
    setInputValue("mineru-token", defaults.mineruToken);
    setInputValue("mineru-user-id", defaults.mineruUserId);
    setInputValue("ocr-language", defaults.ocrLanguage);
    setInputValue("ocr-timeout", String(defaults.ocrTimeoutSeconds));
    setChecked("allow-all-sites", defaults.allowAllSites);
    setChecked("enable-formula-button", defaults.enableFormulaButton);
    return;
  }
  const values = await chrome.storage.local.get({
    mineruToken: "",
    mineruUserId: "",
    ocrLanguage: "ch",
    ocrTimeoutSeconds: 180,
    allowAllSites: false,
    enableFormulaButton: true
  }) as Settings;

  setInputValue("mineru-token", values.mineruToken);
  setInputValue("mineru-user-id", values.mineruUserId);
  setInputValue("ocr-language", values.ocrLanguage);
  setInputValue("ocr-timeout", String(values.ocrTimeoutSeconds));
  setChecked("allow-all-sites", values.allowAllSites);
  setChecked("enable-formula-button", values.enableFormulaButton);
}

async function saveSettings(): Promise<void> {
  if (!hasExtensionApi()) {
    setStatus("请在已加载的浏览器扩展中保存", "error");
    return;
  }
  const settings: Settings = {
    mineruToken: getInputValue("mineru-token").trim(),
    mineruUserId: getInputValue("mineru-user-id").trim(),
    ocrLanguage: getInputValue("ocr-language").trim() || "ch",
    ocrTimeoutSeconds: clamp(Number(getInputValue("ocr-timeout")) || 180, 30, 600),
    allowAllSites: getChecked("allow-all-sites"),
    enableFormulaButton: getChecked("enable-formula-button")
  };

  await chrome.storage.local.set(settings);
  setStatus("已保存", "ok");
}

function getInputValue(id: string): string {
  const input = document.getElementById(id) as HTMLInputElement | null;
  return input?.value ?? "";
}

function setInputValue(id: string, value: string): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (input) input.value = value;
}

function getChecked(id: string): boolean {
  const input = document.getElementById(id) as HTMLInputElement | null;
  return input?.checked ?? false;
}

function setChecked(id: string, value: boolean): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (input) input.checked = value;
}

function setStatus(message: string, tone: "ok" | "error"): void {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
      margin: 0;
      background: #f7f7f8;
    }

    .shell {
      width: min(680px, calc(100vw - 32px));
      margin: 36px auto;
    }

    header {
      margin-bottom: 20px;
    }

    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    p {
      margin: 6px 0 0;
      color: #62636b;
      font-size: 13px;
      line-height: 1.45;
    }

    form {
      display: grid;
      gap: 16px;
      padding: 18px;
      border: 1px solid #dedee5;
      border-radius: 8px;
      background: #fff;
    }

    label {
      display: grid;
      gap: 7px;
      color: #34343a;
      font-size: 13px;
      font-weight: 600;
    }

    input[type="text"],
    input[type="password"],
    input[type="number"] {
      width: 100%;
      box-sizing: border-box;
      min-height: 38px;
      border: 1px solid #cfd0d8;
      border-radius: 8px;
      padding: 8px 10px;
      background: #fff;
      color: #1d1d20;
      font: 14px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 180px;
      gap: 12px;
    }

    .check {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 28px;
      font-weight: 500;
    }

    .check input {
      width: 16px;
      height: 16px;
      margin: 0;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
    }

    button {
      min-height: 38px;
      border: 1px solid #1f2937;
      border-radius: 8px;
      padding: 0 16px;
      background: #1f2937;
      color: #fff;
      cursor: pointer;
      font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-weight: 600;
    }

    #status {
      min-height: 20px;
      margin-top: 12px;
      color: #62636b;
    }

    #status[data-tone="ok"] {
      color: #17633a;
    }

    #status[data-tone="error"] {
      color: #b42318;
    }

    @media (max-width: 560px) {
      .row {
        grid-template-columns: 1fr;
      }
    }

    @media (prefers-color-scheme: dark) {
      :root,
      body {
        background: #17181c;
        color: #f4f4f5;
      }

      form {
        border-color: #383a42;
        background: #22232a;
      }

      label {
        color: #f4f4f5;
      }

      p,
      #status {
        color: #a3a3aa;
      }

      input[type="text"],
      input[type="password"],
      input[type="number"] {
        border-color: #494b55;
        background: #17181c;
        color: #f4f4f5;
      }

      button {
        border-color: #d9dbe1;
        background: #f4f4f5;
        color: #17181c;
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
