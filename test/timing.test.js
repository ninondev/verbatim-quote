// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { findQuote, explainMiss } from "../index.js";

const skip = process.env.VERBATIM_QUOTE_TIMING === "1" ? false : "Set VERBATIM_QUOTE_TIMING=1 to run wall-clock checks.";

test("timing: fifty parts over a megabyte finish in under two seconds", { skip }, () => {
  const chunk = "lorem ipsum dolor sit amet consectetur adipiscing elit ";
  const source = chunk.repeat(Math.ceil((1024 * 1024) / chunk.length));
  const quote = Array.from({ length: 50 }, () => "lorem ipsum dolor sit amet").join(" ... ");
  const started = process.hrtime.bigint();
  const match = findQuote(quote, source, { allowEllipsis: true });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`50-part ellipsis search over ${source.length} characters: ${ms.toFixed(0)} ms`);
  assert.ok(match);
  assert.equal(match.parts.length, 50);
  assert.ok(ms < 2000, `took ${ms.toFixed(0)} ms`);
});

test("timing: the step-limit search finishes in under two seconds", { skip }, () => {
  const source = "x".repeat(1000000);
  const started = Date.now();
  const match = findQuote("xxxxxxxxxx ... xxxxxxxxxx", source, { allowEllipsis: true });
  const ms = Date.now() - started;
  console.log(`step-limit search over ${source.length} characters: ${ms} ms`);
  assert.equal(match, null);
  assert.ok(ms < 2000, `took ${ms} ms`);
});

test("timing: a 60,000-character source and 200-character quote finish in under a second", { skip }, () => {
  const source = "lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(1091).slice(0, 60000);
  const quote = source.slice(0, 200).replace("lorem", "lorxm");
  assert.equal(source.length, 60000);
  assert.equal(quote.length, 200);
  const started = process.hrtime.bigint();
  const miss = explainMiss(quote, source);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`explainMiss over ${source.length} characters with a ${quote.length}-character quote: ${ms.toFixed(0)} ms`);
  assert.equal(miss.status, "close");
  assert.equal(miss.distance, 1);
  assert.ok(ms < 1000, `took ${ms.toFixed(0)} ms`);
});
