#!/usr/bin/env node
// Generates a categorized "What's New" changelog from conventional-commit
// messages between two git refs. Used by .github/workflows/release.yml to
// populate the GitHub Release body, and can be run locally to preview it:
//
//   node scripts/generate-release-notes.mjs --to v0.1.3
//   node scripts/generate-release-notes.mjs --from v0.1.2 --to v0.1.3

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

const INTERNAL_TYPES = new Set(["chore", "docs", "test", "build", "ci"]);
const FEATURE_TYPES = new Set(["feat"]);
const FIX_TYPES = new Set(["fix", "bug"]);
const IMPROVEMENT_TYPES = new Set(["perf", "refactor", "style"]);

const SECTIONS = [
  { key: "breaking", title: "⚠️ Breaking Changes" },
  { key: "features", title: "🚀 New Features" },
  { key: "fixes", title: "🐛 Bug Fixes" },
  { key: "improvements", title: "⚙️ Improvements" },
  { key: "other", title: "📦 Other Changes" },
];

function parseArgs(argv) {
  const args = { from: null, to: "HEAD", out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") args.from = argv[++i];
    else if (arg === "--to") args.to = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
  }
  return args;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function resolvePreviousTag(toRef) {
  try {
    return git(["describe", "--tags", "--abbrev=0", `${toRef}^`]);
  } catch {
    return null; // toRef is the first tag in the repo
  }
}

function collectCommits(fromRef, toRef) {
  const range = fromRef ? `${fromRef}..${toRef}` : toRef;
  const format = `%s${FIELD_SEP}%b${RECORD_SEP}`;
  let raw;
  try {
    raw = git(["log", "--no-merges", `--pretty=format:${format}`, range]);
  } catch {
    return [];
  }
  if (!raw) return [];
  return raw
    .split(RECORD_SEP)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((record) => {
      const [subject, body = ""] = record.split(FIELD_SEP);
      return { subject: subject.trim(), body: body.trim() };
    });
}

const CONVENTIONAL_RE = /^([a-zA-Z]+)(\(([^)]+)\))?(!)?:\s*(.+)$/;

function formatDescription(desc, scope) {
  const trimmed = desc.trim().replace(/\.$/, "");
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return scope ? `**${scope}:** ${capitalized}` : capitalized;
}

function classify(commit) {
  const { subject, body } = commit;
  const isBreaking = /BREAKING CHANGE:/.test(body);
  const match = subject.match(CONVENTIONAL_RE);

  if (match) {
    const [, type, , scope, bang, desc] = match;
    const lowerType = type.toLowerCase();
    const breaking = isBreaking || Boolean(bang);
    const text = formatDescription(desc, scope);

    if (breaking) return { section: "breaking", text };
    if (FEATURE_TYPES.has(lowerType)) return { section: "features", text };
    if (FIX_TYPES.has(lowerType)) return { section: "fixes", text };
    if (IMPROVEMENT_TYPES.has(lowerType)) return { section: "improvements", text };
    if (INTERNAL_TYPES.has(lowerType)) return null;
    return { section: "other", text };
  }

  // Non-conventional commit message: fall back to keyword heuristics so
  // user-facing changes aren't silently dropped just because a commit
  // didn't follow the `type: description` convention.
  if (/^(merge|bump version|release )/i.test(subject)) return null;

  const text = formatDescription(subject);
  if (isBreaking) return { section: "breaking", text };
  if (/\bfix(e[sd])?\b|\bbug\b/i.test(subject)) return { section: "fixes", text };
  if (/\b(add|feat|implement|introduce|support)\b/i.test(subject)) {
    return { section: "features", text };
  }
  return { section: "other", text };
}

export function buildChangelog(fromRef, toRef) {
  const commits = collectCommits(fromRef, toRef);
  const buckets = Object.fromEntries(SECTIONS.map((s) => [s.key, []]));

  for (const commit of commits) {
    const classified = classify(commit);
    if (!classified) continue;
    if (!buckets[classified.section].includes(classified.text)) {
      buckets[classified.section].push(classified.text);
    }
  }

  const lines = [];
  for (const { key, title } of SECTIONS) {
    const items = buckets[key];
    if (items.length === 0) continue;
    lines.push(`### ${title}`, "");
    for (const item of items) lines.push(`- ${item}`);
    lines.push("");
  }

  if (lines.length === 0) {
    return "_No user-facing changes recorded for this release._\n";
  }
  return lines.join("\n").trimEnd() + "\n";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromRef = args.from ?? resolvePreviousTag(args.to);
  const changelog = buildChangelog(fromRef, args.to);
  const heading = `## What's New in ${args.to}\n\n`;
  const output = heading + changelog;

  if (args.out) {
    writeFileSync(args.out, output);
  } else {
    process.stdout.write(output);
  }
}

main();
