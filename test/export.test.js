// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadExportMetadata, readOmissions, reportedTests } from "./export-support.mjs";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");

test("tree checks read additional omissions from the workspace manifest", (t) => {
  const manifest = [".", "publicignore"].join("");
  if (!existsSync(path.join(root, manifest))) {
    t.skip("Omitted-path checks require the workspace manifest; the export verifies omission.");
    return;
  }
  const temp = mkdtempSync(path.join(tmpdir(), "verbatim-omissions-"));
  try {
    const copy = path.join(temp, "tree");
    cpSync(root, copy, { recursive: true, filter: (file) => ![".git", "node_modules"].includes(path.basename(file)) });
    const file = path.join(copy, manifest);
    const draft = `draft-${process.pid}.txt`;
    writeFileSync(file, readFileSync(file, "utf8") + draft + "\n");
    writeFileSync(path.join(copy, draft), "A draft for local review.\n");
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "test/tree.test.js"], { cwd: copy, encoding: "utf8", env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("the workspace manifest rejects escaping paths, wrong kinds and duplicate entries", (t) => {
  const omissions = readOmissions(root);
  if (omissions === null) {
    t.skip("Omitted-path checks require the workspace manifest; the export verifies omission.");
    return;
  }
  const manifest = [".", "publicignore"].join("");
  const temp = mkdtempSync(path.join(tmpdir(), "verbatim-invalid-omissions-"));
  try {
    const draft = `draft-${process.pid}.txt`;
    const entries = [`../escape-${process.pid}.txt`, `${draft}/`, omissions[0]];
    for (const [i, entry] of entries.entries()) {
      const copy = path.join(temp, `tree-${i}`);
      cpSync(root, copy, { recursive: true, filter: (file) => ![".git", "node_modules"].includes(path.basename(file)) });
      writeFileSync(path.join(copy, draft), "A draft for local review.\n");
      const file = path.join(copy, manifest);
      writeFileSync(file, readFileSync(file, "utf8") + entry + "\n");
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap",
        "--test-name-pattern=workspace omitted paths", "test/tree.test.js"], { cwd: copy, encoding: "utf8", env });
      assert.equal(run.status, 1, `invalid manifest entry was accepted: ${entry}\n${run.stdout}${run.stderr}`);
      assert.match(run.stdout, /# fail 1\b/);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("an omitted file does not hide a public file sharing its name prefix", (t) => {
  const omissions = readOmissions(root);
  if (omissions === null) {
    t.skip("Omitted-path checks require the workspace manifest; the export verifies omission.");
    return;
  }
  const omitted = omissions.find((entry) => !entry.endsWith("/"));
  assert.ok(omitted);
  const temp = mkdtempSync(path.join(tmpdir(), "verbatim-omission-prefix-"));
  try {
    const copy = path.join(temp, "tree");
    cpSync(root, copy, { recursive: true, filter: (file) => ![".git", "node_modules"].includes(path.basename(file)) });
    writeFileSync(path.join(copy, `${omitted}.public.txt`), omitted);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap",
      "--test-name-pattern=no public text file", "test/tree.test.js"], { cwd: copy, encoding: "utf8", env });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /contains the ignored path/);
    assert.match(run.stdout, /# fail 1\b/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("public tree checks also pass after every account placeholder is replaced", async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "verbatim-account-"));
  const copy = path.join(temp, "tree");
  try {
    cpSync(root, copy, { recursive: true, filter: (file) => ![".git", "node_modules"].includes(path.basename(file)) });
    function replace(directory) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) replace(file);
        else writeFileSync(file, readFileSync(file, "utf8").replaceAll(["OW", "NER"].join(""), "example-account"));
      }
    }
    replace(copy);
    // This fixture models the completed export, without obsolete placeholder locations.
    const metadata = await loadExportMetadata(copy);
    if (metadata) metadata.completeExportMetadata(copy);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "test/tree.test.js"], { cwd: copy, encoding: "utf8", env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /optional export metadata matches current account locations/);
    assert.equal(reportedTests(run.stdout), 4);
    assert.match(run.stdout, new RegExp(`# pass ${metadata ? 4 : 2}\\b`));
    assert.match(run.stdout, new RegExp(`# skipped ${metadata ? 0 : 2}\\b`));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
