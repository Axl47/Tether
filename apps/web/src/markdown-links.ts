import { resolvePathLinkTarget } from "./terminal-links";

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\/;
const WINDOWS_BROWSER_DRIVE_PATH_PATTERN = /^\/[A-Za-z]:[\\/]/;
const EXTERNAL_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/;
const RELATIVE_PATH_PREFIX_PATTERN = /^(~\/|\.{1,2}\/)/;
const RELATIVE_FILE_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?::\d+){0,2}$/;
const RELATIVE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+\.[A-Za-z0-9_-]+(?::\d+){0,2}$/;
const POSITION_SUFFIX_PATTERN = /:\d+(?::\d+)?$/;
const POSITION_ONLY_PATTERN = /^\d+(?::\d+)?$/;
const POSIX_FILE_ROOT_PREFIXES = [
  "/Users/",
  "/home/",
  "/tmp/",
  "/var/",
  "/etc/",
  "/opt/",
  "/mnt/",
  "/Volumes/",
  "/private/",
  "/root/",
] as const;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripSearchAndHash(value: string): { path: string; hash: string } {
  const hashIndex = value.indexOf("#");
  const pathWithSearch = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const rawHash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const queryIndex = pathWithSearch.indexOf("?");
  const path = queryIndex >= 0 ? pathWithSearch.slice(0, queryIndex) : pathWithSearch;
  return { path, hash: rawHash };
}

function parseFileUrlHref(href: string): { path: string; hash: string } | null {
  try {
    const parsed = new URL(href);
    if (parsed.protocol.toLowerCase() !== "file:") return null;

    const decodedPath = safeDecode(parsed.pathname);
    if (decodedPath.length === 0) return null;

    // Browser URL parser encodes "C:/foo" as "/C:/foo" for file URLs.
    const normalizedPath = /^\/[A-Za-z]:[\\/]/.test(decodedPath)
      ? decodedPath.slice(1)
      : decodedPath;

    return { path: normalizedPath, hash: parsed.hash };
  } catch {
    return null;
  }
}

function looksLikePosixFilesystemPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (POSIX_FILE_ROOT_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (POSITION_SUFFIX_PATTERN.test(path)) return true;
  const basename = path.slice(path.lastIndexOf("/") + 1);
  return /\.[A-Za-z0-9_-]+$/.test(basename);
}

function normalizeWindowsDrivePath(path: string): string {
  return WINDOWS_BROWSER_DRIVE_PATH_PATTERN.test(path) ? path.slice(1) : path;
}

function appendLineColumnFromHash(path: string, hash: string): string {
  if (!hash || POSITION_SUFFIX_PATTERN.test(path)) return path;
  const match = hash.match(/^#L(\d+)(?:C(\d+))?$/i);
  if (!match?.[1]) return path;
  const line = match[1];
  const column = match[2];
  return `${path}:${line}${column ? `:${column}` : ""}`;
}

function isLikelyPathCandidate(path: string): boolean {
  if (WINDOWS_DRIVE_PATH_PATTERN.test(path) || WINDOWS_UNC_PATH_PATTERN.test(path)) return true;
  if (RELATIVE_PATH_PREFIX_PATTERN.test(path)) return true;
  if (path.startsWith("/")) return looksLikePosixFilesystemPath(path);
  return RELATIVE_FILE_PATH_PATTERN.test(path) || RELATIVE_FILE_NAME_PATTERN.test(path);
}

function isRelativePath(path: string): boolean {
  return (
    RELATIVE_PATH_PREFIX_PATTERN.test(path) ||
    (!path.startsWith("/") &&
      !WINDOWS_DRIVE_PATH_PATTERN.test(path) &&
      !WINDOWS_UNC_PATH_PATTERN.test(path))
  );
}

function hasExternalScheme(path: string): boolean {
  const match = path.match(EXTERNAL_SCHEME_PATTERN);
  if (!match) return false;
  const rest = match[2] ?? "";
  if (rest.startsWith("//")) return true;
  return !POSITION_ONLY_PATTERN.test(rest);
}

export function resolveMarkdownFileLinkTarget(
  href: string | undefined,
  cwd?: string,
): string | null {
  if (!href) return null;
  const rawHref = href.trim();
  if (rawHref.length === 0 || rawHref.startsWith("#")) return null;

  const fileUrlTarget = rawHref.toLowerCase().startsWith("file:")
    ? parseFileUrlHref(rawHref)
    : null;
  const source = fileUrlTarget ?? stripSearchAndHash(rawHref);
  const decodedPath = normalizeWindowsDrivePath(
    fileUrlTarget ? source.path.trim() : safeDecode(source.path.trim()),
  );
  const decodedHash = safeDecode(source.hash.trim());

  if (decodedPath.length === 0) return null;
  if (
    !WINDOWS_DRIVE_PATH_PATTERN.test(decodedPath) &&
    !WINDOWS_UNC_PATH_PATTERN.test(decodedPath) &&
    hasExternalScheme(decodedPath)
  ) {
    return null;
  }

  if (!isLikelyPathCandidate(decodedPath)) return null;

  const pathWithPosition = appendLineColumnFromHash(decodedPath, decodedHash);
  if (!isRelativePath(pathWithPosition)) {
    return pathWithPosition;
  }

  if (!cwd) return null;
  return resolvePathLinkTarget(pathWithPosition, cwd);
}

export function normalizeMarkdownFileLinks(markdown: string, cwd?: string): string {
  let cursor = 0;
  let normalized = "";

  while (cursor < markdown.length) {
    const fencedBlockEnd = readFencedCodeBlockEnd(markdown, cursor);
    if (fencedBlockEnd !== null) {
      normalized += markdown.slice(cursor, fencedBlockEnd);
      cursor = fencedBlockEnd;
      continue;
    }

    const inlineCodeEnd = readInlineCodeSpanEnd(markdown, cursor);
    if (inlineCodeEnd !== null) {
      normalized += markdown.slice(cursor, inlineCodeEnd);
      cursor = inlineCodeEnd;
      continue;
    }

    const link = readMarkdownLink(markdown, cursor);
    if (link) {
      const trimmedDestination = link.destination.trim();
      if (
        trimmedDestination.length > 0 &&
        /\s/.test(trimmedDestination) &&
        !(trimmedDestination.startsWith("<") && trimmedDestination.endsWith(">")) &&
        resolveMarkdownFileLinkTarget(trimmedDestination, cwd)
      ) {
        normalized += `[${link.label}](<${trimmedDestination}>)`;
      } else {
        normalized += link.raw;
      }
      cursor = link.end;
      continue;
    }

    normalized += markdown[cursor];
    cursor += 1;
  }

  return normalized;
}

function readMarkdownLink(
  markdown: string,
  start: number,
): { raw: string; label: string; destination: string; end: number } | null {
  if (markdown[start] !== "[" || markdown[start - 1] === "!") {
    return null;
  }

  const match = /^\[([^\]\n]+)\]\(([^)\n]+)\)/.exec(markdown.slice(start));
  if (!match?.[0] || !match[1] || !match[2]) {
    return null;
  }

  return {
    raw: match[0],
    label: match[1],
    destination: match[2],
    end: start + match[0].length,
  };
}

function readInlineCodeSpanEnd(markdown: string, start: number): number | null {
  if (markdown[start] !== "`") {
    return null;
  }

  let tickCount = 1;
  while (markdown[start + tickCount] === "`") {
    tickCount += 1;
  }

  const fence = "`".repeat(tickCount);
  const closingIndex = markdown.indexOf(fence, start + tickCount);
  return closingIndex === -1 ? null : closingIndex + tickCount;
}

function readFencedCodeBlockEnd(markdown: string, start: number): number | null {
  const fenceChar = markdown[start];
  if ((fenceChar !== "`" && fenceChar !== "~") || !isFenceLineStart(markdown, start)) {
    return null;
  }

  let fenceLength = 1;
  while (markdown[start + fenceLength] === fenceChar) {
    fenceLength += 1;
  }
  if (fenceLength < 3) {
    return null;
  }

  const contentStart = findLineEnd(markdown, start);
  if (contentStart === markdown.length) {
    return markdown.length;
  }

  let lineStart = contentStart;
  while (lineStart < markdown.length) {
    const lineEnd = findLineEnd(markdown, lineStart);
    if (isFenceLineClose(markdown.slice(lineStart, lineEnd), fenceChar, fenceLength)) {
      return lineEnd;
    }
    lineStart = lineEnd;
  }

  return markdown.length;
}

function isFenceLineStart(markdown: string, start: number): boolean {
  const lineStart = markdown.lastIndexOf("\n", start - 1) + 1;
  return /^[ \t]{0,3}$/.test(markdown.slice(lineStart, start));
}

function isFenceLineClose(line: string, fenceChar: string, fenceLength: number): boolean {
  const trimmedLine = line.trimStart();
  let actualFenceLength = 0;
  while (trimmedLine[actualFenceLength] === fenceChar) {
    actualFenceLength += 1;
  }

  return actualFenceLength >= fenceLength && trimmedLine.slice(actualFenceLength).trim().length === 0;
}

function findLineEnd(markdown: string, start: number): number {
  const nextNewline = markdown.indexOf("\n", start);
  return nextNewline === -1 ? markdown.length : nextNewline + 1;
}
