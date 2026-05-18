import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyActiveAnswerMarkdown, copyVisibleChatMarkdown } from "../src/content/dom";

describe("chat DOM extraction", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 320,
      height: 80,
      top: 0,
      right: 320,
      bottom: 80,
      left: 0,
      toJSON: () => ({})
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("copies the latest assistant answer instead of the user turn", () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">解释欧拉公式。</article>
        <article data-message-author-role="assistant">
          <p>欧拉公式是 <span data-math="e^{i\\theta}=\\cos\\theta+i\\sin\\theta"></span>。</p>
        </article>
      </main>
    `;

    const markdown = copyActiveAnswerMarkdown();

    expect(markdown).toContain("欧拉公式是");
    expect(markdown).toContain("$e^{i\\theta}=\\cos\\theta+i\\sin\\theta$");
    expect(markdown).not.toContain("解释欧拉公式");
  });

  it("keeps visible chat turns in document order", () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">解释欧拉公式。</article>
        <article data-message-author-role="assistant">欧拉公式是 <span data-math="e^{i\\theta}=\\cos\\theta+i\\sin\\theta"></span>。</article>
      </main>
    `;

    const markdown = copyVisibleChatMarkdown();

    expect(markdown).toMatch(/^解释欧拉公式。[\s\S]+欧拉公式是/);
  });
});
