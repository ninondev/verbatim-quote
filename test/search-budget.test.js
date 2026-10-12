// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { reportedTests } from "./export-support.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");

test("the placement budget permits exactly 200,000 aligned checks", async () => {
  // Export the actual private function from a test-only module; its implementation is unchanged.
  const module = await import("data:text/javascript;base64," + Buffer.from(source + "\nexport { locate };\n").toString("base64"));
  const haystack = "x".repeat(1000000);
  for (const acceptedAt of [199999, 200000, Infinity]) {
    let visits = 0;
    const match = module.locate(haystack, ["x"], 300, (_, at) => { visits += 1; return at === acceptedAt; }, true);
    assert.equal(visits, 200000);
    assert.deepEqual(match, acceptedAt === 199999 ? [[199999, 200000]] : null);
  }
});

test("diagnostic cell work equals the folded length product and stops above its limit", async () => {
  const point = "current[j] = Math.min(diagonal, deletion, insertion);";
  assert.equal(source.split(point).length, 3, "instrument both cost-update paths");
  const instrumented = source.replaceAll(point, "cells += 1; " + point) + "\nexport let cells = 0;\n";
  const module = await import("data:text/javascript;base64," + Buffer.from(instrumented).toString("base64"));
  const text = "lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(1091).slice(0, 60000);
  const quote = text.slice(0, 200).replace("lorem", "lorxm");
  assert.equal([...module.normalize(quote).text].length, 200);
  assert.equal([...module.normalize(text).text].length, 59999, "folding trims the final source space");
  assert.equal(module.explainMiss(quote, text).distance, 1);
  assert.equal(module.cells, 11999800);
  assert.equal(module.explainMiss("at least 18", "at least 180").distance, 1);
  assert.equal(module.cells, 11999932, "a rejected exact passage also visits its entire 11 by 12 product");
  assert.deepEqual(module.explainMiss("x".repeat(60), "y".repeat(1000000)), { status: "limit" });
  assert.equal(module.cells, 11999932, "an oversized input visits no additional cells");
});

test("default stress checks are independent of the wall clock", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "verbatim-clock-"));
  try {
    const preload = path.join(temp, "clock.mjs");
    writeFileSync(preload, "let ticks = 0n; process.hrtime.bigint = () => (ticks += 5000000000n); let ms = 0; Date.now = () => (ms += 5000);\n");
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.VERBATIM_QUOTE_TIMING;
    const run = spawnSync(process.execPath, ["--import", preload, "--test", "--test-reporter=tap",
      "--test-name-pattern=fifty parts|step limit|60,000-character", "test/verbatim.test.js", "test/explain.test.js"],
    { cwd: root, encoding: "utf8", env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(reportedTests(run.stdout), 3);
    assert.match(run.stdout, /# pass 3\b/);
    assert.match(run.stdout, /# skipped 0\b/);
    assert.match(run.stdout, /# fail 0\b/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
