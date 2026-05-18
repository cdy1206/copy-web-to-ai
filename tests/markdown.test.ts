import { describe, expect, it } from "vitest";
import { htmlToMarkdown, pageToMarkdown } from "../src/content/markdown";

describe("htmlToMarkdown", () => {
  it("preserves code blocks, links, lists, tables, and LaTeX", () => {
    const markdown = htmlToMarkdown(`
      <article>
        <h2>Result</h2>
        <p>Formula <span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">a^2+b^2=c^2</annotation></semantics></math></span><span class="katex-html">fallback</span></span>.</p>
        <pre><code class="language-ts">const x = 1;</code></pre>
        <ul><li><a href="/docs">docs</a></li></ul>
        <table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>
      </article>
    `);

    expect(markdown).toContain("## Result");
    expect(markdown).toContain("$a^2+b^2=c^2$");
    expect(markdown).toContain("```");
    expect(markdown).toContain("const x = 1;");
    expect(markdown).toContain("- [docs](");
    expect(markdown).toContain("| A |");
  });

  it("copies the loaded full page while dropping extension UI and hidden noise", () => {
    document.title = "Full Page Example";
    window.history.replaceState({}, "", "/full-page");
    document.body.innerHTML = `
      <div id="copytex-plus-ui-root"><button>复制</button><p>internal toast</p></div>
      <main>
        <h1>Article</h1>
        <p>First screen text.</p>
        <section style="margin-top: 1800px">
          <h2>Below fold</h2>
          <p>Loaded content below the viewport.</p>
          <p>Formula <span data-math="x^2+y^2=z^2"></span></p>
        </section>
      </main>
      <p hidden>Hidden copy should not appear.</p>
      <script>window.noise = true;</script>
    `;

    const markdown = pageToMarkdown();

    expect(markdown).toContain("# Full Page Example");
    expect(markdown).toContain("Source:");
    expect(markdown).toContain("First screen text.");
    expect(markdown).toContain("Loaded content below the viewport.");
    expect(markdown).toContain("$x^2+y^2=z^2$");
    expect(markdown).not.toContain("internal toast");
    expect(markdown).not.toContain("Hidden copy should not appear");
    expect(markdown).not.toContain("window.noise");
  });
});
