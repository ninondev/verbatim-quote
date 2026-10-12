// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
// Guards the packaging contract: complete package.json at 1.0.0 with
// zero runtime dependencies, the exact file list npm would publish, and a
// CHANGELOG entry for the release.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");

test("package.json is complete: 1.0.0, exports, types, files, license, engines, keywords, no dependencies", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "verbatim-quote");
  assert.equal(pkg.version, "1.0.0");
  assert.ok(pkg.exports && pkg.types, "exports and types must be declared");
  assert.ok(Array.isArray(pkg.files) && pkg.files.includes("index.js") && pkg.files.includes("index.d.ts"));
  assert.ok(pkg.license && pkg.engines && Array.isArray(pkg.keywords) && pkg.keywords.length > 0);
  assert.equal(pkg.homepage, "https://ninondev.github.io/verbatim-quote/");
  assert.equal(pkg.repository?.url, "git+https://github.com/ninondev/verbatim-quote.git");
  assert.equal(pkg.bugs, "https://github.com/ninondev/verbatim-quote/issues");
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    assert.equal(pkg[field], undefined, `zero runtime dependencies means no "${field}"`);
  }
});

test("npm pack would publish exactly the seven published files", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const [pack] = JSON.parse(result.stdout);
  const files = pack.files.map((entry) => entry.path).sort();
  assert.deepEqual(files, [
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "bin/verbatim-quote.js",
    "index.d.ts",
    "index.js",
    "package.json",
  ]);
});

test("CHANGELOG.md has a 1.0.0 entry that names the library features", () => {
  const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /^##?\s*1\.0\.0\b/m);
  for (const word of ["boundary", "compatibility", "--quotes", "explainMiss", "Playground"]) {
    assert.ok(changelog.includes(word), `the 1.0.0 entry mentions ${word}`);
  }
});
