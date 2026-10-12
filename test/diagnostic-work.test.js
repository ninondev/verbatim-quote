// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { explainMiss } from "../index.js";

test("the ASCII diagnostic shortcut preserves mixed grapheme boundaries", () => {
  const quote = "a\u200d hello world";
  const source = "ba\u200d hello worldx";
  const miss = explainMiss(quote, source);
  assert.equal(miss.status, "close");
  assert.equal(miss.distance, 1);
  assert.deepEqual(miss.nearest, { start: 1, end: source.length, text: source.slice(1) });
});

test("diagnostics fold each input once and skip distance cells for short missing quotes", async () => {
  const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  const signature = "export function normalize(text, options = {}) {";
  const point = "current[j] = Math.min(diagonal, deletion, insertion);";
  assert.equal(source.split(signature).length, 2);
  assert.equal(source.split(point).length, 3);
  const instrumented = source.replace(signature, signature + " folded.push(text);")
    .replaceAll(point, "cells += 1; " + point) + "\nexport const folded = []; export let cells = 0;\n";
  const module = await import("data:text/javascript;base64," + Buffer.from(instrumented).toString("base64"));
  const quote = "hello worle";
  const text = "hello worldx and hello world";
  assert.equal(module.explainMiss(quote, text).status, "close");
  assert.deepEqual(module.folded, [quote, text]);
  module.folded.length = 0;
  const cells = module.cells;
  assert.deepEqual(module.explainMiss("xy", "z".repeat(1000)), { status: "far" });
  assert.deepEqual(module.folded, ["xy", "z".repeat(1000)]);
  assert.equal(module.cells, cells, "a zero-distance threshold cannot yield a close miss");
  assert.equal(module.explainMiss("xy", "xy"), null, "short matches still return null");
  assert.deepEqual(module.explainMiss("xy", "z".repeat(25000001)), { status: "limit" },
    "short quotes still obey the full product limit before the fast far result");
});
