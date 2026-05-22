#!/usr/bin/env node
// Local link-discovery crawler.
// Usage:  node tools/crawl.js [--depth N] [--timeout MS]
//
// Crawls from SEED_URLS, enriches with GitHub API data, detects backlinks
// to MY_DOMAINS, then writes ../graph-data.json.

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parse as parseHtml } from "node-html-parser";

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, "..");
const static_ = JSON.parse(readFileSync(join(__dir, "static-nodes.json"), "utf8"));

// ── Config ────────────────────────────────────────────────────────────────────
const GITHUB_USER = "DavidKozdra";

const MY_DOMAINS = [
  "davidkozdra.github.io",
  "davidkozdra.com",
  "github.com/davidkozdra",
  "github.com/damienjk",
  "linkedin.com/in/david-kozdra",
  "magentaautumn.itch.io",
  "floridanationalnews.com",
];

// Pages to crawl outbound links from (depth 1 = just these, depth 2 = follow their links, etc.)
const SEED_URLS = [
  "https://davidkozdra.github.io/",
  "https://github.com/DavidKozdra",
  "https://magentaautumn.itch.io/",
  "https://floridanationalnews.com/",
  "https://www.linkedin.com/in/david-kozdra-5ab269186/",
];

// Domains to follow when deep-crawling (stay focused, don't spider the whole web)
const CRAWL_ALLOW = [
  "davidkozdra.github.io",
  "davidkozdra.com",
  "github.com/DavidKozdra",
  "github.com/DamienJK",
  "magentaautumn.itch.io",
];

const args        = process.argv.slice(2);
const depthIdx    = args.indexOf("--depth");
const timeoutIdx  = args.indexOf("--timeout");
const MAX_DEPTH   = depthIdx  >= 0 ? parseInt(args[depthIdx  + 1], 10) : 2;
const TIMEOUT_MS  = timeoutIdx >= 0 ? parseInt(args[timeoutIdx + 1], 10) : 8000;
const CONCURRENCY = 6;

const CATEGORY_MAP = {
  "C#": "desktop", "HLSL": "game", "ShaderLab": "game", "GDScript": "game",
  "Lua": "game", "Java": "mobile", "Kotlin": "mobile", "Swift": "mobile",
  "JavaScript": "web", "TypeScript": "web", "HTML": "web", "CSS": "web", "Python": "web",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function categoryFromLang(lang) { return CATEGORY_MAP[lang] || "web"; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalise(href, base) {
  try {
    const url = new URL(href, base);
    url.hash = "";
    url.search = "";           // strip query strings for dedup
    return url.href.replace(/\/$/, ""); // strip trailing slash
  } catch { return null; }
}

function isAllowed(urlStr) {
  return CRAWL_ALLOW.some(pat => urlStr.includes(pat));
}

function domainOf(urlStr) {
  try { return new URL(urlStr).hostname.replace(/^www\./, ""); } catch { return ""; }
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "DavidKozdra-graph-crawler/1.0" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "text/html";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    return await res.text();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function extractLinks(html, base) {
  const root = parseHtml(html);
  const links = new Set();
  root.querySelectorAll("a[href]").forEach(a => {
    const href = a.getAttribute("href");
    const norm = normalise(href, base);
    if (norm && norm.startsWith("http")) links.add(norm);
  });
  return [...links];
}

function extractMeta(html, url) {
  const root = parseHtml(html);
  const title = root.querySelector("title")?.text?.trim() ||
                root.querySelector("meta[property='og:title']")?.getAttribute("content") || "";
  const desc  = root.querySelector("meta[name='description']")?.getAttribute("content") ||
                root.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
  return { title, desc };
}

function linksToMyDomains(links) {
  return links.filter(l => MY_DOMAINS.some(d => l.toLowerCase().includes(d.toLowerCase())));
}

// ── GitHub enrichment ─────────────────────────────────────────────────────────
async function fetchGithubRepos() {
  const url = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`;
  const headers = { "User-Agent": "DavidKozdra-graph-crawler/1.0" };
  if (process.env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) { console.warn(`  GitHub API ${res.status} — skipping repos`); return []; }
    return res.json();
  } catch { return []; }
}

// ── Crawler ───────────────────────────────────────────────────────────────────
async function crawl() {
  const visited    = new Set();
  const discovered = new Map(); // url → { title, desc, links, backlinksToMe }
  let   queue      = SEED_URLS.map(u => ({ url: u, depth: 0 }));

  console.log(`Crawling (max depth ${MAX_DEPTH}, timeout ${TIMEOUT_MS}ms per page)...`);

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    await Promise.all(batch.map(async ({ url, depth }) => {
      if (visited.has(url)) return;
      visited.add(url);
      process.stdout.write(`  [d${depth}] ${url.slice(0, 80)}\n`);

      const html = await fetchPage(url);
      if (!html) return;

      const links  = extractLinks(html, url);
      const meta   = extractMeta(html, url);
      const myRefs = linksToMyDomains(links);

      discovered.set(url, { ...meta, links, backlinksToMe: myRefs });

      if (depth < MAX_DEPTH) {
        const next = links
          .filter(l => isAllowed(l) && !visited.has(l))
          .map(u => ({ url: u, depth: depth + 1 }));
        queue.push(...next);
      }

      await sleep(120); // gentle rate-limit
    }));
  }

  console.log(`  Crawled ${visited.size} pages, discovered ${discovered.size} with content.`);
  return discovered;
}

// ── Build graph ───────────────────────────────────────────────────────────────
async function main() {
  // 1. Crawl
  const pages = await crawl();

  // 2. GitHub repos
  console.log("Fetching GitHub repos...");
  const repos = await fetchGithubRepos();
  console.log(`  Got ${repos.length} repos.`);

  // 3. Build nodes from static config
  const nodes      = [...static_.nodes];
  const edges      = [...static_.edges];
  const existingIds = new Set(nodes.map(n => n.id));
  const repoIdMap  = {};

  const ONE_YEAR_AGO = Date.now() - 365 * 24 * 60 * 60 * 1000;

  // 4. Add GitHub repo nodes
  for (const repo of repos) {
    if (repo.fork) continue;
    if (repo.pushed_at && new Date(repo.pushed_at).getTime() < ONE_YEAR_AGO) continue;
    const id = `repo-${repo.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    repoIdMap[repo.name] = id;
    if (existingIds.has(id)) continue;

    nodes.push({
      id,
      label: repo.name.replace(/[-_]/g, "\n"),
      category: categoryFromLang(repo.language),
      desc: repo.description || repo.name,
      url: repo.homepage || repo.html_url,
      favId: "fav-github",
      stars: repo.stargazers_count,
      language: repo.language,
    });
    existingIds.add(id);
    edges.push({ f: "github", g: id });
  }

  // Wire named repoEdges from static config
  for (const [name, targets] of Object.entries(static_.repoEdges || {})) {
    const fromId = repoIdMap[name];
    if (!fromId) continue;
    for (const t of [targets].flat()) {
      if (!edges.some(e => e.f === fromId && e.g === t)) edges.push({ f: fromId, g: t });
    }
  }

  // 5. Add discovered pages as nodes
  const knownUrls = new Set(nodes.map(n => n.url).filter(Boolean));

  // Patterns that are always YOUR work even if they don't backlink elsewhere
  const OWN_PAGE_PATTERNS = [
    /magentaautumn\.itch\.io\/[^/]+$/,   // individual itch.io game pages
    /github\.com\/DavidKozdra\/[^/]+$/,  // top-level repo pages
    /github\.com\/DamienJK\/[^/]+$/,
  ];

  // Noise paths to skip (GitHub sub-pages, blob/tree paths)
  const SKIP_PATTERNS = [
    /\/(issues|pulls|actions|projects|security|pulse|branches|tags|commits|blob|tree|graphs|network|search|activity|watchers|forks|releases|stargazers|community)\b/,
    /\.(png|jpg|jpeg|gif|svg|ico|pdf|zip)$/i,
  ];

  for (const [url, data] of pages.entries()) {
    if (knownUrls.has(url)) continue;
    if (SKIP_PATTERNS.some(p => p.test(url))) continue;

    const domain = domainOf(url);
    const isOwnPage = OWN_PAGE_PATTERNS.some(p => p.test(url));
    const hasBacklink = data.backlinksToMe.length > 0;

    if (!isOwnPage && !hasBacklink) continue;
    if (!isOwnPage && MY_DOMAINS.some(d => domain.includes(d))) continue;

    // Determine category from URL
    let cat = "web";
    if (url.includes("itch.io")) cat = "game";
    else if (url.includes("github.com")) cat = "web";

    // Make a stable ID from the URL path
    const slug = url.replace(/https?:\/\//, "").replace(/[^a-z0-9]/gi, "-").slice(0, 48);
    const id = `disc-${slug}`;
    if (existingIds.has(id)) continue;

    const label = (data.title || domain).slice(0, 32);
    nodes.push({
      id,
      label,
      category: cat,
      desc: data.desc || `Discovered at ${domain}`,
      url,
      favId: url.includes("itch.io") ? "fav-itchio" : "fav-github",
      isDiscovered: true,
    });
    existingIds.add(id);
    knownUrls.add(url);

    // Wire to parent: itch games → itchio node, github repos → github node
    if (url.includes("itch.io")) {
      edges.push({ f: "itchio", g: id });
    } else if (url.includes("github.com/DavidKozdra") || url.includes("github.com/DamienJK")) {
      edges.push({ f: "github", g: id });
    }

    // Backlinks → edge to whatever they reference
    for (const backlink of data.backlinksToMe) {
      const target = nodes.find(n => n.url && backlink.includes(domainOf(n.url)));
      if (target && target.id !== id) {
        const edge = { f: id, g: target.id };
        if (!edges.some(e => e.f === edge.f && e.g === edge.g)) edges.push(edge);
      }
    }
  }

  // 6. Write output
  const out = {
    generated: new Date().toISOString(),
    stats: {
      pagesCrawled: pages.size,
      githubRepos: repos.length,
      nodes: nodes.length,
      edges: edges.length,
    },
    nodes,
    edges,
  };

  const outPath = join(ROOT, "graph-data.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${nodes.length} nodes, ${edges.length} edges → graph-data.json`);
  console.log(`Stats: ${out.stats.pagesCrawled} pages crawled, ${repos.length} GitHub repos`);
}

main().catch(err => { console.error(err); process.exit(1); });
