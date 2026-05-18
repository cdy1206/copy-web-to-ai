# CopyTeX+

把网页、AI 对话和数学公式，干净地复制成适合继续投喂 AI 的 Markdown/LaTeX。

很多时候，你真正想复制的不是“页面长什么样”，而是“页面在说什么”：ChatGPT 的一段回答、Gemini 里的公式、Claude 的代码块、一篇网页里夹着表格和链接的正文。CopyTeX+ 的目标很简单：能从 DOM 直接拿到的内容，就在本地转成 Markdown；只有图片、canvas 或无法选择的视觉内容，才由你手动框选后送去 OCR。

这意味着它默认不偷跑上传、不抓后台历史、不碰登录接口。它像一把顺手的小刀，只处理你当前看得见、想复制的内容。

## 它适合谁

- 经常把 ChatGPT、Gemini、Claude、DeepSeek 的回答整理到笔记或继续发给另一个 AI 的人。
- 需要复制公式、代码、表格、链接，但普通复制会丢格式的人。
- 遇到禁止选择、禁止右键、图片公式、canvas 内容时，希望有一个可控兜底的人。
- 不想安装高权限、带会员/计费/远程后端的“万能复制”插件的人。

## 核心功能

| 功能 | 说明 |
| --- | --- |
| 复制选区 | 把当前选中的网页内容转成 Markdown，保留公式、代码块、链接、列表和表格。 |
| 复制当前回答 | 在 AI 聊天页中复制鼠标所在或最近的一条助手回答。 |
| 复制可见会话 | 复制当前页面中已经渲染出来的 AI 对话内容。 |
| 复制整页 | 直接读取当前页面已加载的 DOM，复制为 Markdown/LaTeX，包含屏幕下方已经存在的内容。 |
| 悬浮复制公式 | 鼠标移到 KaTeX、MathJax、MathML、Gemini `data-math` 等公式上，一键复制 `$...$` 或 `$$...$$`。 |
| 解锁复制 | 临时对当前标签页启用文本选择，并拦截常见的复制/选择阻断。 |
| 框选 OCR | 对图片、canvas、不可选内容手动框选截图，确认后调用 MinerU OCR，结果复制为 Markdown/LaTeX。 |

## 为什么不是一直截图 OCR

截图 OCR 是兜底，不是主路。

能从网页 DOM 直接复制时，CopyTeX+ 会优先本地解析 HTML。这样更快、更准，也更适合 AI 继续处理：代码还是代码块，链接还是链接，表格还是表格，公式也尽量保留为 LaTeX。

只有这几类情况才建议用 OCR：

- 页面内容本来就是图片或扫描件。
- 公式被渲染进 canvas，没有可读的 DOM 源。
- 网站用虚拟列表、懒加载或反复制策略，只把视觉结果暴露出来。
- 你只想截取页面上的某个局部，而不是复制整页。

## 支持的网站

默认注入这些 AI 聊天站点：

- ChatGPT: `chatgpt.com`、`chat.openai.com`
- Gemini: `gemini.google.com`
- Claude: `claude.ai`
- DeepSeek: `chat.deepseek.com`

其他网站可以在设置中开启“允许所有网站”。开启后仍然是本地 DOM/选区处理，除非你主动使用 MinerU OCR。

## 安装

```bash
npm install
npm run build
```

然后打开浏览器扩展管理页：

- Chrome: `chrome://extensions`
- Edge: `edge://extensions`

开启“开发者模式”，选择“加载已解压的扩展”，加载项目里的 `dist` 目录。

## 使用

点击浏览器工具栏里的 CopyTeX+ 图标：

- `复制选区`：先选中页面内容，再点击。
- `复制当前回答`：适合在 AI 聊天页快速拿到一条回答。
- `复制可见会话`：适合整理当前屏幕附近的对话。
- `复制整页`：适合把当前网页已加载内容整体交给 AI。
- `解锁复制`：只对当前标签页临时生效。
- `框选 OCR`：拖拽框选可见区域，确认后上传裁剪图片到 MinerU。

也可以用右键菜单触发常用操作。

## MinerU OCR

OCR 是显式触发的。流程是：

1. 你点击 `框选 OCR`。
2. 你手动框选当前可见区域。
3. 扩展只裁剪并上传这个区域的 PNG。
4. MinerU 返回 Markdown 后，扩展复制到剪贴板。

配置项在扩展设置页：

- MinerU Token
- MinerU 用户标识，可留空，扩展会尝试从 JWT 中读取
- OCR 语言，默认 `ch`
- OCR 超时时间

Token 只保存在 `chrome.storage.local`，不要写进源码、README、issue 或日志。如果 token 曾经发到聊天里，建议轮换。

## 隐私边界

- 没有 analytics。
- 没有远程脚本。
- 没有自动上传网页内容。
- 没有 `eval`。
- 不调用平台登录 API 抓取完整历史会话。
- 除手动 OCR 外，不发起网络请求。
- 不绕过 DRM、付费墙或用户当前不可见的内容。

安全检查可以跑：

```bash
rg -n "fetch|XMLHttpRequest|sendBeacon|eval|Function\\(|analytics|telemetry|mineruToken" src public
```

预期网络请求只出现在显式 MinerU OCR 相关代码里。

## 开发

```bash
npm run test
npm run build
npm run check
```

测试覆盖：

- KaTeX、MathJax、MathML、Gemini `data-math` 等公式提取。
- Markdown 转换中的代码块、列表、链接、表格。
- AI 聊天 DOM 中的当前回答和可见会话提取。
- MinerU OCR 上传、轮询和结果 zip 解析。

## 项目结构

```text
public/manifest.json      MV3 扩展声明
src/background/           Service worker、菜单、截图裁剪、MinerU OCR
src/content/              页面注入脚本、DOM 提取、Markdown/LaTeX 转换、解锁复制
src/popup/                扩展弹窗
src/options/              设置页
tests/                    单元测试和本地 fixture
```

## 限制

`复制整页` 读取的是当前页面已经加载到 DOM 里的内容。对于无限滚动、虚拟列表或懒加载网页，页面还没加载出来的部分不会凭空出现。遇到这种页面，可以先滚动加载，再复制整页；如果内容是图片化的，就用框选 OCR。

## 许可证

当前项目面向个人本地加载和二次开发使用。正式发布前请补充许可证文件和商店合规说明。
