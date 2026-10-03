// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { attachmentMarkdown, renderMarkdown } from "./markdown";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function dom(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("Anhänge in Markdown", () => {
  it("Bild: Vorschaubild mit Link aufs Original", () => {
    const d = dom(renderMarkdown(`![Karte von Barovia](attachment:${ID})`));
    const img = d.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(`/api/attachments/${ID}/content?variant=thumb`);
    expect(img.getAttribute("alt")).toBe("Karte von Barovia");
    expect(img.getAttribute("loading")).toBe("lazy");
    const a = img.closest("a")!;
    expect(a.getAttribute("href")).toBe(`/api/attachments/${ID}/content`);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener");
  });

  it("Link auf ein PDF", () => {
    const a = dom(renderMarkdown(`Siehe [Regeln](attachment:${ID}).`)).querySelector("a")!;
    expect(a.getAttribute("href")).toBe(`/api/attachments/${ID}/content`);
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("fremde Bilder werden nicht geladen", () => {
    const md = renderMarkdown("![Tracker](https://evil.example/pixel.png)");
    expect(md).not.toContain("evil.example");
    expect(dom(md).querySelector("img")).toBeNull();
    // Auch als rohes HTML nicht
    const raw = dom(renderMarkdown('<img src="https://evil.example/p.png" srcset="https://evil.example/2.png 2x">'));
    const img = raw.querySelector("img");
    expect(img?.getAttribute("src") ?? null).toBeNull();
    expect(img?.getAttribute("srcset") ?? null).toBeNull();
    expect(dom(renderMarkdown(`<img src="/api/attachments/${ID}/content/../../me/export">`)).querySelector("img")?.getAttribute("src") ?? null).toBeNull();
  });

  it("keine Skripte, keine Handler, keine ungültigen Anhang-Verweise", () => {
    const html = renderMarkdown(`<img src="/api/attachments/${ID}/content" onerror="alert(1)"><script>alert(2)</script>[x](javascript:alert(3))`);
    expect(html).not.toMatch(/onerror|<script|javascript:/i);
    expect(renderMarkdown("![x](attachment:../../etc)")).not.toContain("<img");
    // Normale Links bekommen kein target
    expect(dom(renderMarkdown("[Web](https://example.org)")).querySelector("a")!.getAttribute("target")).toBeNull();
  });

  it("Schnipsel zum Einfügen", () => {
    expect(attachmentMarkdown({ id: ID, kind: "image", title: "Karte [alt]", originalName: "" })).toBe(`![Karte alt](attachment:${ID})`);
    expect(attachmentMarkdown({ id: ID, kind: "pdf", title: "", originalName: "Regeln.pdf" })).toBe(`[Regeln.pdf](attachment:${ID})`);
  });
});
