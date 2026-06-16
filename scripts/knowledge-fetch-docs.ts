/**
 * knowledge-fetch-docs.ts
 *
 * Fetches curated public documentation pages from GitHub (raw markdown) and
 * HTML sources (AWS, PostgreSQL, Vercel) and writes them as structured markdown
 * files to knowledge/external-docs/{source}/.
 *
 * Strategies:
 *   github-raw  — fetches raw MDX/MD from public GitHub repos, strips front-matter and JSX
 *   html-fetch  — fetches HTML pages, extracts main content, converts to markdown
 *
 * Usage:
 *   npm run knowledge:fetch            # fetch, skip pages cached within 7 days
 *   npm run knowledge:refresh          # force re-fetch all pages (bypass cache)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManifestPage {
  path?: string;       // github-raw: relative path from basePath
  url?: string;        // html-fetch: full URL
  title: string;
  tags: string[];
  // Per-page overrides (used by AWS where each page has its own repo)
  baseRepo?: string;
  baseBranch?: string;
  basePath?: string;
}

interface ManifestSource {
  source: string;
  sourceType: string;
  strategy: "github-raw" | "html-fetch";
  baseRepo?: string;
  baseBranch?: string;
  basePath?: string;
  productArea: string;
  pages: ManifestPage[];
}

interface CacheEntry {
  url: string;
  fetchedAt: string;
  title: string;
}

interface FetchCache {
  [relFilePath: string]: CacheEntry;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const EXTERNAL_DOCS_DIR = join(ROOT, "knowledge", "external-docs");
const MANIFEST_PATH = join(EXTERNAL_DOCS_DIR, "manifest.json");
const CACHE_PATH = join(EXTERNAL_DOCS_DIR, ".fetch-cache.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_MS = 1000; // 1 request/sec per domain
const USER_AGENT = "signal-ops-ai/1.0 (documentation-indexer)";
const FORCE = process.argv.includes("--force");

// ─── Cache helpers ────────────────────────────────────────────────────────────

function loadCache(): FetchCache {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as FetchCache;
  } catch {
    return {};
  }
}

function saveCache(cache: FetchCache): void {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

function isCacheHit(cache: FetchCache, relPath: string): boolean {
  if (FORCE) return false;
  const entry = cache[relPath];
  if (!entry) return false;
  return Date.now() - new Date(entry.fetchedAt).getTime() < CACHE_TTL_MS;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

const lastRequestTimes = new Map<string, number>();

async function rateLimit(url: string): Promise<void> {
  const domain = new URL(url).hostname;
  const last = lastRequestTimes.get(domain) ?? 0;
  const wait = RATE_LIMIT_MS - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTimes.set(domain, Date.now());
}

// ─── robots.txt ───────────────────────────────────────────────────────────────

const robotsCache = new Map<string, string[]>(); // origin → disallowed paths

async function loadRobots(origin: string): Promise<void> {
  if (robotsCache.has(origin)) return;
  const disallowed: string[] = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      let inAll = false;
      for (const line of (await res.text()).split("\n")) {
        const t = line.trim();
        if (/^user-agent:/i.test(t)) {
          inAll = t.split(":").slice(1).join(":").trim() === "*";
        } else if (inAll && /^disallow:/i.test(t)) {
          const p = t.split(":").slice(1).join(":").trim();
          if (p) disallowed.push(p);
        }
      }
    }
  } catch {
    // robots.txt fetch failed — assume allowed
  }
  robotsCache.set(origin, disallowed);
}

async function isAllowed(url: string): Promise<boolean> {
  const { origin, pathname } = new URL(url);
  await loadRobots(origin);
  const disallowed = robotsCache.get(origin) ?? [];
  const blocked = disallowed.some((d) => d.length > 0 && pathname.startsWith(d));
  return !blocked;
}

// ─── GitHub raw fetcher ───────────────────────────────────────────────────────

async function fetchGithubRaw(rawUrl: string): Promise<string | null> {
  await rateLimit(rawUrl);
  try {
    const res = await fetch(rawUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function cleanMdx(raw: string): string {
  return (
    raw
      // Strip YAML front-matter
      .replace(/^---[\s\S]*?---\s*\n/, "")
      // Strip TS/JS import lines
      .replace(/^import\s+[\s\S]*?from\s+['"][^\n'"]*['"]\s*;?\s*$/gm, "")
      // Strip self-closing JSX components  <Component ... />
      .replace(/<[A-Z]\w*[^>]*\/>/g, "")
      // Strip paired JSX components  <Component>...</Component>
      .replace(/<[A-Z]\w*[^>]*>[\s\S]*?<\/[A-Z]\w*>/g, "")
      // Collapse excessive blank lines
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
  );
}

// ─── HTML fetcher + extractor ─────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  if (!(await isAllowed(url))) {
    console.log(`    ⚠ blocked by robots.txt — skipping`);
    return null;
  }
  await rateLimit(url);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractHtml(html: string): string {
  let c = html;

  // Remove noisy structural sections
  for (const tag of ["script", "style", "nav", "header", "footer", "aside", "noscript", "iframe", "form", "dialog"]) {
    c = c.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), "");
  }

  // Prefer a specific content container over the entire page.
  // Patterns listed from most specific to least specific.
  const main =
    c.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    c.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    // PostgreSQL docs use <div class="chapter"> or <div class="sect1">
    c.match(/<div[^>]*class="(?:chapter|book|sect\d)[^"]*"[^>]*>([\s\S]{300,}?)<\/div>/i)?.[1] ??
    // Common CMS / doc-site content containers
    c.match(/<div[^>]*(?:class|id)="[^"]*(?:content|main|docs?|article|page|body)[^"]*"[^>]*>([\s\S]{300,}?)<\/div>/i)?.[1];
  if (main) c = main;

  // Headings → markdown
  c = c
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n");

  // Code blocks → fences (pre > code first, then inline code)
  c = c
    .replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, "\n\n```\n$1\n```\n\n")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

  // Lists
  c = c
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<\/[ou]l>/gi, "\n");

  // Paragraphs and breaks
  c = c
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n");

  // Strong / em
  c = c
    .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
    .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, "_$1_");

  // Strip remaining tags
  c = c.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  c = c
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));

  // Normalise whitespace
  c = c
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  return c;
}

// ─── Metadata header ──────────────────────────────────────────────────────────

function metaHeader(title: string, src: ManifestSource, page: ManifestPage, fetchUrl: string): string {
  // Show source URL for html-fetch pages (direct link back to the doc)
  // For github-raw pages, fetchUrl is a raw.githubusercontent.com URL — not useful for readers
  const displayUrl = src.strategy === "html-fetch" ? page.url : undefined;
  const urlLine = displayUrl ? `**Source URL:** ${displayUrl}\n` : "";
  return `# ${title}

**Source Type:** ${src.sourceType}
**Tags:** ${page.tags.join(", ")}
**Product Area:** ${src.productArea}
${urlLine}`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sizeKb(s: string): string {
  return (Buffer.byteLength(s, "utf-8") / 1024).toFixed(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const manifest: ManifestSource[] = JSON.parse(
    readFileSync(MANIFEST_PATH, "utf-8")
  );
  const cache = loadCache();

  const stats = { fetched: 0, cached: 0, failed: 0 };

  console.log(`\nFetching public documentation...${FORCE ? " (--force)" : ""}`);
  console.log("─".repeat(55));

  for (const src of manifest) {
    const sourceDir = join(EXTERNAL_DOCS_DIR, src.source);
    mkdirSync(sourceDir, { recursive: true });

    console.log(`\n${src.source.padEnd(16)} [${src.strategy}]`);

    for (const page of src.pages) {
      const slug = slugify(page.title);
      const outPath = join(sourceDir, `${slug}.md`);
      const relPath = `knowledge/external-docs/${src.source}/${slug}.md`;

      // ── Cache hit ──
      if (isCacheHit(cache, relPath)) {
        console.log(`  ↩  ${page.title.slice(0, 48).padEnd(48)} (cached)`);
        stats.cached++;
        continue;
      }

      // ── Fetch ──
      let fetchUrl: string;
      let raw: string | null = null;

      if (src.strategy === "github-raw") {
        // Per-page repo/branch/path overrides take precedence (e.g. AWS uses one repo per service)
        const repo = page.baseRepo ?? src.baseRepo;
        const branch = page.baseBranch ?? src.baseBranch;
        const base = page.basePath ?? src.basePath;
        fetchUrl = [
          "https://raw.githubusercontent.com",
          repo,
          branch,
          base,
          page.path,
        ].join("/");
        raw = await fetchGithubRaw(fetchUrl);
      } else {
        fetchUrl = page.url!;
        raw = await fetchHtml(fetchUrl);
      }

      if (!raw) {
        console.log(`  ✗  ${page.title.slice(0, 48).padEnd(48)} (fetch failed)`);
        stats.failed++;
        continue;
      }

      // ── Transform ──
      let body: string;
      if (src.strategy === "github-raw") {
        body = cleanMdx(raw);
      } else {
        body = extractHtml(raw);
      }

      const final = metaHeader(page.title, src, page, fetchUrl) + "\n" + body;

      writeFileSync(outPath, final, "utf-8");
      console.log(`  ✓  ${page.title.slice(0, 48).padEnd(48)} (${sizeKb(final)} KB)`);

      // ── Update cache ──
      cache[relPath] = { url: fetchUrl, fetchedAt: new Date().toISOString(), title: page.title };
      saveCache(cache);
      stats.fetched++;
    }
  }

  console.log("\n" + "─".repeat(55));
  console.log(
    `Fetched: ${stats.fetched}  |  Cached: ${stats.cached}  |  Failed: ${stats.failed}`
  );
  if (stats.fetched > 0) {
    console.log("Files written to knowledge/external-docs/");
    console.log("Run `npm run knowledge:ingest` to embed and store.\n");
  }
}

main().catch((e) => {
  console.error("knowledge-fetch-docs failed:", e);
  process.exit(1);
});
