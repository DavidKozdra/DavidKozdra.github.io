#!/usr/bin/env node
// Fetches public GitHub repos for DavidKozdra, merges with static-nodes.json,
// and writes ../graph-data.json ready for index.html to fetch.

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, "..");

const static_ = JSON.parse(readFileSync(join(__dir, "static-nodes.json"), "utf8"));

const GITHUB_USER = "DavidKozdra";
const CATEGORY_MAP = {
  "C#":         "desktop",
  "HLSL":       "game",
  "ShaderLab":  "game",
  "GDScript":   "game",
  "Lua":        "game",
  "Java":       "mobile",
  "Kotlin":     "mobile",
  "Swift":      "mobile",
  "JavaScript": "web",
  "TypeScript": "web",
  "HTML":       "web",
  "CSS":        "web",
  "Python":     "web",
};

function categoryFromLang(lang) {
  return CATEGORY_MAP[lang] || "web";
}

async function fetchRepos() {
  const url = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`;
  const headers = { "User-Agent": "build-graph-script" };
  if (process.env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn(`GitHub API returned ${res.status} — using cached static data only.`);
    return [];
  }
  return res.json();
}

async function main() {
  console.log("Fetching repos from GitHub...");
  const repos = await fetchRepos();
  console.log(`  Got ${repos.length} repos.`);

  // Start from static nodes/edges
  const nodes = [...static_.nodes];
  const edges = [...static_.edges];

  // Track IDs already present
  const existingIds = new Set(nodes.map(n => n.id));

  // Map repo.name → node id (for edge wiring)
  const repoIdMap = {};

  const ONE_YEAR_AGO = Date.now() - 365 * 24 * 60 * 60 * 1000;

  for (const repo of repos) {
    if (repo.fork) continue;
    if (repo.pushed_at && new Date(repo.pushed_at).getTime() < ONE_YEAR_AGO) continue;
    const id = `repo-${repo.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    repoIdMap[repo.name] = id;
    if (existingIds.has(id)) continue;

    const cat = categoryFromLang(repo.language);
    const label = repo.name.replace(/-/g, "\n").replace(/_/g, "\n");

    nodes.push({
      id,
      label,
      category: cat,
      desc: repo.description || repo.name,
      url: repo.homepage || repo.html_url,
      favId: "fav-github",
      stars: repo.stargazers_count,
      language: repo.language,
    });
    existingIds.add(id);

    // Always link repo → github hub node
    edges.push({ f: "github", g: id });
  }

  // Wire named repoEdges from static config
  for (const [repoName, targets] of Object.entries(static_.repoEdges || {})) {
    const fromId = repoIdMap[repoName];
    if (!fromId) continue;
    const ts = Array.isArray(targets) ? targets : [targets];
    for (const t of ts) {
      // Only add if not duplicate
      if (!edges.some(e => e.f === fromId && e.g === t)) {
        edges.push({ f: fromId, g: t });
      }
    }
  }

  const out = {
    generated: new Date().toISOString(),
    nodes,
    edges,
  };

  const outPath = join(ROOT, "graph-data.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${nodes.length} nodes, ${edges.length} edges → graph-data.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
