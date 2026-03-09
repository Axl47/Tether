import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";

import { normalizeMarkdownFileLinks, resolveMarkdownFileLinkTarget } from "./markdown-links";

describe("resolveMarkdownFileLinkTarget", () => {
  it("resolves absolute posix file paths", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/julius/project/AGENTS.md")).toBe(
      "/Users/julius/project/AGENTS.md",
    );
  });

  it("resolves relative file paths against cwd", () => {
    expect(resolveMarkdownFileLinkTarget("src/processRunner.ts:71", "/Users/julius/project")).toBe(
      "/Users/julius/project/src/processRunner.ts:71",
    );
  });

  it("does not treat filename line references as external schemes", () => {
    expect(resolveMarkdownFileLinkTarget("script.ts:10", "/Users/julius/project")).toBe(
      "/Users/julius/project/script.ts:10",
    );
  });

  it("resolves bare file names against cwd", () => {
    expect(resolveMarkdownFileLinkTarget("AGENTS.md", "/Users/julius/project")).toBe(
      "/Users/julius/project/AGENTS.md",
    );
  });

  it("maps #L line anchors to editor line suffixes", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/julius/project/src/main.ts#L42C7")).toBe(
      "/Users/julius/project/src/main.ts:42:7",
    );
  });

  it("normalizes browser-style windows drive paths", () => {
    expect(resolveMarkdownFileLinkTarget("/C:/Users/julius/project/src/main.ts#L42C7")).toBe(
      "C:/Users/julius/project/src/main.ts:42:7",
    );
  });

  it("ignores external urls", () => {
    expect(resolveMarkdownFileLinkTarget("https://example.com/docs")).toBeNull();
  });

  it("does not double-decode file URLs", () => {
    expect(resolveMarkdownFileLinkTarget("file:///Users/julius/project/file%2520name.md")).toBe(
      "/Users/julius/project/file%20name.md",
    );
  });

  it("does not treat app routes as file links", () => {
    expect(resolveMarkdownFileLinkTarget("/chat/settings")).toBeNull();
  });
});

describe("normalizeMarkdownFileLinks", () => {
  it("repairs markdown file links whose windows paths include spaces", () => {
    const input =
      "[site/assets/site.css#L302](/C:/Users/Adam/Workspaces/My Roblox/site/assets/site.css#L302)";

    expect(normalizeMarkdownFileLinks(input)).toBe(
      "[site/assets/site.css#L302](</C:/Users/Adam/Workspaces/My Roblox/site/assets/site.css#L302>)",
    );
  });

  it("leaves external links with titles unchanged", () => {
    const input = '[docs](https://example.com "Example")';

    expect(normalizeMarkdownFileLinks(input)).toBe(input);
  });

  it("produces parseable markdown for repaired file links", () => {
    const input =
      "[site/assets/site.css#L302](/C:/Users/Adam/Workspaces/My Roblox/site/assets/site.css#L302)";
    const html = renderToStaticMarkup(
      React.createElement(ReactMarkdown, null, normalizeMarkdownFileLinks(input)),
    );

    expect(html).toContain(
      '<a href="/C:/Users/Adam/Workspaces/My%20Roblox/site/assets/site.css#L302">',
    );
  });

  it("does not rewrite inline code spans", () => {
    const input = "`[site/assets/site.css#L302](/C:/Users/Adam/Workspaces/My Roblox/site/assets/site.css#L302)`";

    expect(normalizeMarkdownFileLinks(input)).toBe(input);
  });

  it("does not rewrite fenced code blocks", () => {
    const input = [
      "```md",
      "[site/assets/site.css#L302](/C:/Users/Adam/Workspaces/My Roblox/site/assets/site.css#L302)",
      "```",
    ].join("\n");

    expect(normalizeMarkdownFileLinks(input)).toBe(input);
  });
});
