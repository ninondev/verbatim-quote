// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
// The public tree must carry no private marker. The walk skips .git, node_modules and the
// paths the maintainer's export leaves out (read from the ignore file at runtime), and the
// forbidden words are built by joining pieces so that this very file, which is public, does
// not contain them itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readOmissions, loadExportMetadata } from "./export-support.mjs";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");

const omissions = readOmissions(root);
const hasManifest = omissions !== null;
const ignored = omissions ?? [];
const isIgnored = (relative) =>
  ignored.some((entry) => relative === entry || (entry.endsWith("/") &&
    (relative === entry.slice(0, -1) || relative.startsWith(entry))));

function* walk(directory, prefix = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (isIgnored(relative)) continue;
    if (entry.isDirectory()) yield* walk(path.join(directory, entry.name), relative);
    else yield relative;
  }
}

const files = [...walk(root)];

test("workspace omitted paths come only from its manifest", (t) => {
  assert.ok(files.length > 20, `the walk found ${files.length} public files`);
  if (!hasManifest) {
    t.skip("Omitted-path checks require the workspace manifest; the export verifies omission.");
    return;
  }
  assert.ok(ignored.length > 0);
  assert.equal(new Set(ignored).size, ignored.length, "omitted paths must be unique");
  for (const entry of ignored) {
    assert.equal(path.posix.normalize(entry), entry, "omitted paths must be canonical");
    const absolute = path.resolve(root, entry);
    assert.ok(absolute.startsWith(root + path.sep), "omitted paths must stay inside the tree");
    // An omission can reserve a private path that is deliberately absent in this account.
    // Existing paths must still have the declared kind; never follow omitted symlinks.
    let info;
    try {
      info = lstatSync(absolute);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    assert.ok(info.isFile() || info.isDirectory(), "an omitted path must be a file or directory");
    assert.equal(info.isDirectory(), entry.endsWith("/"), "directory omissions must end in a slash");
  }
});

test("no public text file carries a private marker", (t) => {
  if (!hasManifest) t.diagnostic("Omitted-name checks skipped: the export verifies omission; no workspace manifest is present.");
  const forbidden = [
    { what: "a home-directory path", token: ["/Us", "ers/"].join("") },
    { what: "the parent folder of this workspace", pattern: new RegExp(`(^|[^A-Za-z])${["o", "ss"].join("")}([^A-Za-z]|$)`) },
    ...ignored.map((entry) => ({
      what: `the ignored path ${entry.replace(/\/$/, "...")}`,
      token: entry,
    })),
  ];
  for (const relative of files) {
    const content = readFileSync(path.join(root, relative), "utf8");
    for (const rule of forbidden) {
      if (rule.token !== undefined) {
        assert.ok(!content.includes(rule.token), `${relative} contains ${rule.what}`);
      } else {
        assert.ok(!rule.pattern.test(content), `${relative} contains ${rule.what}`);
      }
    }
  }
});

test("every relative link in the README points at a public file", () => {
  const readme = readFileSync(path.join(root, "README.md"), "utf8");
  const links = [
    ...[...readme.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
    ...[...readme.matchAll(/(?:src|srcset)="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
  ]
    .map((link) => link.replace(/[#?].*$/, ""))
    .filter((link) => link.length > 0 && !/^[a-z]+:\/\//i.test(link) && !link.startsWith("/"));
  assert.match(readme, /\[Try it in the playground\]\(https:\/\/[^)]+\/verbatim-quote\/\)/);
  for (const link of links) {
    assert.ok(existsSync(path.join(root, link)), `README links to ${link}, which is missing`);
    assert.ok(!isIgnored(link), `README links to ${link}, which the export leaves out`);
  }
});

test("optional export metadata matches current account locations", async (t) => {
  const metadata = await loadExportMetadata(root);
  if (metadata === null) {
    t.skip("Private export metadata is absent from published trees.");
    return;
  }
  metadata.auditExportMetadata(root, files);
});
