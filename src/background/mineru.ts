import { strFromU8, unzipSync } from "fflate";

export interface MineruSettings {
  mineruToken: string;
  mineruUserId?: string;
  ocrLanguage: string;
  ocrTimeoutSeconds: number;
}

type MineruEnvelope<T> = {
  code?: number | string;
  msgCode?: number | string;
  success?: boolean;
  msg?: string;
  data?: T;
  trace_id?: string;
  traceId?: string;
};

interface UploadUrlData {
  batch_id: string;
  file_urls: string[];
  files?: string[];
}

interface BatchResultItem {
  file_name?: string;
  state: "done" | "waiting-file" | "pending" | "running" | "failed" | "converting";
  full_zip_url?: string;
  err_msg?: string;
}

interface BatchResultData {
  batch_id: string;
  extract_result: BatchResultItem[];
}

const API_BASE = "https://mineru.net/api/v4";

export async function runMineruOcr(blob: Blob, settings: MineruSettings): Promise<string> {
  const token = settings.mineruToken.trim();
  if (!token) {
    throw new Error("请先在设置页填写 MinerU Token");
  }

  const fileName = `copytex-region-${Date.now()}.png`;
  const dataId = `copytex-${crypto.randomUUID()}`;
  const mineruUserId = normalizeMineruUserId(settings.mineruUserId) ?? extractUserIdFromJwt(token);
  const { batchId, uploadUrl } = await createUploadUrl(token, mineruUserId, fileName, dataId, settings.ocrLanguage);
  await uploadFile(uploadUrl, blob);
  const zipUrl = await pollBatchResult(token, mineruUserId, batchId, settings.ocrTimeoutSeconds);
  const markdown = await fetchMarkdownFromZip(zipUrl);
  if (!markdown.trim()) throw new Error("MinerU 返回了空 Markdown");
  return markdown.trim();
}

async function createUploadUrl(
  token: string,
  mineruUserId: string | undefined,
  fileName: string,
  dataId: string,
  language: string
): Promise<{ batchId: string; uploadUrl: string }> {
  const response = await fetch(`${API_BASE}/file-urls/batch`, {
    method: "POST",
    headers: buildMineruHeaders(token, mineruUserId, true),
    body: JSON.stringify({
      enable_formula: true,
      enable_table: true,
      language,
      model_version: "vlm",
      files: [
        {
          name: fileName,
          data_id: dataId,
          is_ocr: true
        }
      ]
    })
  });

  const payload = await readJson<MineruEnvelope<UploadUrlData>>(response);
  assertMineruOk(payload);

  const batchId = payload.data?.batch_id;
  const uploadUrl = payload.data?.file_urls?.[0] ?? payload.data?.files?.[0];
  if (!batchId || !uploadUrl) throw new Error("MinerU 没有返回上传地址");
  return { batchId, uploadUrl };
}

function buildMineruHeaders(token: string, mineruUserId: string | undefined, includeContentType = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`
  };
  if (includeContentType) headers["Content-Type"] = "application/json";
  if (mineruUserId) headers.token = mineruUserId;
  return headers;
}

function normalizeMineruUserId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function extractUserIdFromJwt(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;

  try {
    const json = JSON.parse(base64UrlDecode(payload)) as Record<string, unknown>;
    for (const key of ["uuid", "openId", "jti", "clientId"]) {
      const value = json[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return atob(padded);
}

async function uploadFile(uploadUrl: string, blob: Blob): Promise<void> {
  // Signed object-storage PUT URLs are sensitive to signed headers. Sending an
  // ArrayBuffer avoids fetch adding Blob's Content-Type header implicitly.
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: await blobToArrayBuffer(blob)
  });

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 240);
    throw new Error(`截图上传失败：HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
  }
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("无法读取截图数据"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("无法读取截图数据"));
    reader.readAsArrayBuffer(blob);
  });
}

async function pollBatchResult(
  token: string,
  mineruUserId: string | undefined,
  batchId: string,
  timeoutSeconds: number
): Promise<string> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastState = "pending";

  while (Date.now() < deadline) {
    const response = await fetch(`${API_BASE}/extract-results/batch/${batchId}`, {
      method: "GET",
      headers: buildMineruHeaders(token, mineruUserId)
    });

    const payload = await readJson<MineruEnvelope<BatchResultData>>(response);
    assertMineruOk(payload);

    const result = payload.data?.extract_result?.[0];
    if (!result) throw new Error("MinerU 没有返回解析状态");
    lastState = result.state;

    if (result.state === "done") {
      if (!result.full_zip_url) throw new Error("MinerU 没有返回结果 zip");
      return result.full_zip_url;
    }

    if (result.state === "failed") {
      throw new Error(result.err_msg || "MinerU OCR 失败");
    }

    await sleep(2500);
  }

  throw new Error(`MinerU OCR 超时，最后状态：${lastState}`);
}

async function fetchMarkdownFromZip(zipUrl: string): Promise<string> {
  const response = await fetch(zipUrl);
  if (!response.ok) throw new Error(`下载 MinerU 结果失败：HTTP ${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  const files = unzipSync(bytes);
  const fullMdKey =
    Object.keys(files).find((name) => /(^|\/)full\.md$/i.test(name)) ??
    Object.keys(files).find((name) => /\.md$/i.test(name));

  if (!fullMdKey) throw new Error("MinerU 结果 zip 中没有 Markdown 文件");
  return strFromU8(files[fullMdKey]);
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = tryParseJson<MineruEnvelope<unknown>>(text);

  if (!response.ok) {
    if (payload) throw new Error(formatMineruError(payload, `HTTP ${response.status}`));
    throw new Error(`MinerU 请求失败：HTTP ${response.status} ${text.slice(0, 180)}`);
  }

  if (!payload) {
    throw new Error(`MinerU 返回了非 JSON 响应：${text.slice(0, 180)}`);
  }
  return payload as T;
}

function tryParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function assertMineruOk(payload: MineruEnvelope<unknown>): void {
  if (payload.code === 0 || payload.code === "0") return;
  if (payload.success === true && payload.code == null && payload.msgCode == null) return;
  throw new Error(formatMineruError(payload));
}

function formatMineruError(payload: MineruEnvelope<unknown>, prefix = "MinerU 返回错误"): string {
  const code = payload.code ?? payload.msgCode;
  const trace = payload.trace_id ?? payload.traceId;
  const parts = [prefix];
  if (code != null) parts.push(String(code));
  if (payload.msg) parts.push(`：${payload.msg}`);
  if (trace) parts.push(`（trace: ${trace}）`);
  return parts.join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
