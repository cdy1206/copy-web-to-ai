import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMineruOcr } from "../src/background/mineru";

describe("runMineruOcr", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not upload anything when MinerU token is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      runMineruOcr(new Blob(["png"]), {
        mineruToken: "",
        ocrLanguage: "ch",
        ocrTimeoutSeconds: 1
      })
    ).rejects.toThrow("请先在设置页填写 MinerU Token");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds MinerU user header from JWT and reports current API error shape", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        code: 4003,
        msg: "upload denied",
        trace_id: "trace-1"
      })
    );
    const token = makeJwt({ uuid: "user-123" });

    await expect(
      runMineruOcr(new Blob(["png"]), {
        mineruToken: token,
        ocrLanguage: "ch",
        ocrTimeoutSeconds: 1
      })
    ).rejects.toThrow("MinerU 返回错误4003：upload denied（trace: trace-1）");

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ token: "user-123" });
  });

  it("uploads signed URL body as ArrayBuffer and accepts files response field", async () => {
    const zip = zipSync({ "full.md": strToU8("# OCR\n\n$E=mc^2$") });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/file-urls/batch")) {
        return jsonResponse({
          code: 0,
          data: {
            batch_id: "batch-1",
            files: ["https://mineru.oss-cn-shanghai.aliyuncs.com/upload"]
          }
        });
      }
      if (url.includes("oss-cn-shanghai")) {
        expect(init?.body).toBeInstanceOf(ArrayBuffer);
        return new Response("", { status: 200 });
      }
      if (url.includes("/extract-results/batch/")) {
        return jsonResponse({
          code: 0,
          data: {
            batch_id: "batch-1",
            extract_result: [{ state: "done", full_zip_url: "https://cdn.example/result.zip" }]
          }
        });
      }
      if (url.includes("result.zip")) {
        return new Response(zip, { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    });

    const markdown = await runMineruOcr(new Blob(["png"], { type: "image/png" }), {
      mineruToken: makeJwt({ uuid: "user-123" }),
      ocrLanguage: "ch",
      ocrTimeoutSeconds: 1
    });

    expect(markdown).toBe("# OCR\n\n$E=mc^2$");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

function makeJwt(payload: Record<string, unknown>): string {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encodedPayload}.signature`;
}
