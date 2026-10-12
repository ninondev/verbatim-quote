// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
// explainMiss says what is different when a quote is missing. It is a diagnostic;
// findQuote, verifyQuote and checkQuotes are unchanged by it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainMiss } from "../index.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("the explain CLI prints the whole rule-rejected number", () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/verbatim-quote.js", import.meta.url)),
    "-", "at least 18", "--explain"], { input: "... at least 180 days", encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /closest at 4-16: at least 180/);
  assert.match(run.stdout, /difference: quote "18", source "180"/);
});

const PAGE =
  "Who can participate\nParticipants must be at least 18 years old — and “legal residents” of an eligible country.";

test("a changed number is a changed difference with both sides and source offsets", () => {
  const miss = explainMiss("must be at least 21 years old", PAGE);
  assert.equal(miss.status, "close");
  assert.equal(miss.distance, 2);
  assert.equal(miss.nearest.text, "must be at least 18 years old");
  assert.equal(PAGE.slice(miss.nearest.start, miss.nearest.end), miss.nearest.text);
  assert.deepEqual(miss.differences, [{ kind: "changed", quote: "21", source: "18", start: 50, end: 52 }]);
  assert.equal(PAGE.slice(50, 52), "18", "the offsets point at the source side");
});

test("a dropped word, an added word and a changed Chinese character keep their kind", () => {
  const dropped = explainMiss("Entries must be shared publicly", "Entries must not be shared publicly.");
  assert.equal(dropped.status, "close");
  const [d] = dropped.differences;
  assert.equal(d.kind, "dropped");
  assert.equal(d.quote, "");
  assert.ok(d.source.includes("not"), "the dropped word is in the source side");
  assert.equal("Entries must not be shared publicly.".slice(d.start, d.end), d.source);

  const added = explainMiss("must be at least very 18 years old", "must be at least 18 years old");
  const [a] = added.differences;
  assert.equal(a.kind, "added");
  assert.equal(a.source, "");
  assert.equal(a.start, a.end, "an added difference has equal offsets");
  assert.equal(a.quote, "very");

  const zh = explainMiss("未成年人不能参加本次比赛", "未成年人没法参加本次比赛。");
  assert.equal(zh.status, "close");
  const [z] = zh.differences;
  assert.equal(z.kind, "changed");
  assert.ok(z.quote.includes("不能") && z.source.includes("没法"));
  assert.equal("未成年人没法参加本次比赛".slice(z.start, z.end), z.source);
});

test("a boundary-rejected number is explained with the whole source number", () => {
  const source = "... at least 180 days";
  const miss = explainMiss("at least 18", source);
  assert.equal(miss.status, "close");
  assert.deepEqual(miss.nearest, { start: 4, end: 16, text: "at least 180" });
  assert.equal(miss.distance, 1);
  assert.deepEqual(miss.differences, [{ kind: "changed", quote: "18", source: "180", start: 13, end: 16 }]);
  assert.equal(source.slice(miss.nearest.start, miss.nearest.end), miss.nearest.text);
});

test("a rejected exact window does not suppress a later close passage", () => {
  const miss = explainMiss("hello world", "hello worldx and hello worle");
  assert.equal(miss.status, "close");
  assert.equal(miss.nearest.text, "hello worle");
  assert.equal(miss.distance, 1);
  assert.equal(miss.differences[0].source, "worle");
});

test("boundary diagnostics widen both ends through whole words and numbers", () => {
  for (const [quote, source, whole] of [
    ["ello world", "hello world", "hello world"],
    ["at least 18", "at least 18.5", "at least 18.5"],
    ["cost 1,000", "cost 1,000,000", "cost 1,000,000"],
    ["is -18", "is -180", "is -180"],
  ]) {
    const miss = explainMiss(quote, source);
    if (quote === "cost 1,000") assert.deepEqual(miss, { status: "far" });
    else {
      assert.equal(miss.status, "close", quote);
      assert.equal(miss.nearest.text, whole);
      assert.ok(miss.distance > 0);
      for (const difference of miss.differences) assert.equal(source.slice(difference.start, difference.end), difference.source);
    }
  }
});

test("a found quote and an empty quote give null", () => {
  assert.equal(explainMiss("at least 18 years old", PAGE), null);
  assert.equal(explainMiss("", PAGE), null);
});

test("an unrelated quote is far, an oversized input is limit", () => {
  assert.deepEqual(explainMiss("something about zebras in the desert", PAGE), { status: "far" });
  assert.deepEqual(explainMiss("x".repeat(60), "y".repeat(1000000)), { status: "limit" });
});

test("the same input gives the same output twice", () => {
  const one = explainMiss("must be at least 21 years old", PAGE);
  const two = explainMiss("must be at least 21 years old", PAGE);
  assert.deepEqual(one, two);
});

test("a 60,000-character source with a 200-character quote has the expected edit distance", () => {
  const source = "lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(1091).slice(0, 60000);
  const quote = source.slice(0, 200).replace("lorem", "lorxm");
  assert.equal(source.length, 60000);
  assert.equal(quote.length, 200, "the benchmark must use its claimed quote length");
  const miss = explainMiss(quote, source);
  assert.equal(miss.status, "close");
  assert.equal(miss.distance, 1);
});

test("a passage cut short to avoid a rejected match is not preferred when it is farther", () => {
  // The rejected exact text "ab, cdefgh=i" sits inside "Zab, cdefgh=i"; the whole word is one edit away,
  // and a passage that stops before the final "i" would claim the page lacks it.
  const result = explainMiss("ab, cdefgh=i", "x=Zab, cdefgh=i");
  assert.equal(result.status, "close");
  assert.equal(result.distance, 1);
  assert.equal(result.nearest.text, "Zab, cdefgh=i");
});
