import { describe, expect, it } from "vitest";
import { parseBookmarksHtml, toBookmarksHtml } from "./bookmarks";

const SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Barra de favoritos</H3>
    <DL><p>
        <DT><A HREF="https://github.com/" ADD_DATE="1700000001">GitHub</A>
        <DT><H3>Dev &amp; Docs</H3>
        <DL><p>
            <DT><A HREF="https://reactflow.dev/">React Flow</A>
            <DT><A HREF="javascript:void(0)">Bookmarklet</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://example.com/">Solto</A>
</DL><p>`;

describe("parseBookmarksHtml", () => {
  it("turns folders into a tree and skips non-http links", () => {
    const root = parseBookmarksHtml(SAMPLE);
    expect(root.links.map((l) => l.title)).toEqual(["Solto"]);
    expect(root.children).toHaveLength(1);
    const bar = root.children[0];
    expect(bar.name).toBe("Barra de favoritos");
    expect(bar.links).toEqual([{ title: "GitHub", url: "https://github.com/", addedAt: 1700000001000 }]);
    expect(bar.children[0].name).toBe("Dev & Docs");
    expect(bar.children[0].links.map((l) => l.url)).toEqual(["https://reactflow.dev/"]);
  });

  it("round-trips through export", () => {
    const html = toBookmarksHtml(parseBookmarksHtml(SAMPLE));
    const again = parseBookmarksHtml(html);
    expect(again.children[0].children[0].name).toBe("Dev & Docs");
    expect(again.children[0].links[0].url).toBe("https://github.com/");
  });
});
