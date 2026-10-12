// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
// The playground's pure helpers, the default example, the byte-identical library copy, and
// the no-addresses / no-innerHTML rules. These checks cover code and pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkQuotes, explainMiss } from "../index.js";
import {
  DEFAULT_QUOTES,
  DEFAULT_SOURCE,
  buildSegments,
  differenceSpans,
  optionsFrom,
  parseQuotes,
  quoteDifferenceSpans,
  summaryText,
} from "../docs/playground.js";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");

test("parseQuotes takes one quote per line and drops blank lines", () => {
  assert.deepEqual(parseQuotes(" a \n\nb\n\r\nc  \n"), ["a", "b", "c"]);
});

test("optionsFrom maps the checkboxes to library options", () => {
  assert.deepEqual(optionsFrom({ ignoreCase: true, ignoreWhitespace: false, allowEllipsis: false, compatibility: false }), {
    ignoreCase: true,
    whitespace: "collapse",
    allowEllipsis: false,
    compatibility: false,
  });
  assert.equal(optionsFrom({ ignoreWhitespace: true }).whitespace, "ignore");
});

test("buildSegments merges overlapping and adjacent matches, keeps disjoint ones apart", () => {
  assert.deepEqual(buildSegments([[10, 20], [15, 30]]), [[10, 30]], "overlapping");
  assert.deepEqual(buildSegments([[0, 5], [5, 10]]), [[0, 10]], "adjacent");
  assert.deepEqual(buildSegments([[20, 25], [0, 5], [7, 9]]), [[0, 5], [7, 9], [20, 25]], "disjoint, in order");
  assert.deepEqual(buildSegments([[3, 4], [1, 2], [2, 3]]), [[1, 4]], "a chain merges into one");
});

test("summaryText states how many of the quotes are in the source", () => {
  assert.equal(summaryText(2, 4), "2 of 4 quotes are in the source.");
});

test("differenceSpans keeps only real source ranges and merges them", () => {
  assert.deepEqual(
    differenceSpans([
      { kind: "dropped", quote: "", source: "not", start: 13, end: 16 },
      { kind: "added", quote: "very", source: "", start: 20, end: 20 },
      { kind: "changed", quote: "21", source: "18", start: 15, end: 17 },
    ]),
    [[13, 17]],
  );
});

test("quoteDifferenceSpans outlines the quote's own differing words, both sides covered", () => {
  const differences = [
    { kind: "dropped", quote: "", source: "not" },
    { kind: "changed", quote: "21", source: "18" },
    { kind: "changed", quote: "old", source: "older" },
  ];
  assert.deepEqual(quoteDifferenceSpans("at least 21 years old", differences), [
    [9, 11],
    [18, 21],
  ]);
  assert.deepEqual(quoteDifferenceSpans("at least 18 years old", []), []);
  assert.deepEqual(
    quoteDifferenceSpans("words the source lacks", [{ kind: "added", quote: "lacks", source: "" }]),
    [[17, 22]],
  );
  // A side that does not appear verbatim (case folding) is skipped, not guessed.
  assert.deepEqual(quoteDifferenceSpans("Words differ", [{ kind: "changed", quote: "words", source: "items" }]), []);
});

test("missing rows use three columns, a nowrap status and a closest line that spans them", () => {
  const html = readFileSync(path.join(root, "docs", "index.html"), "utf8");
  assert.match(html, /\.quotes li\s*\{[^}]*grid-template-columns:\s*24px 1fr auto/s, "same columns as found rows");
  assert.match(html, /\.status\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(html, /\.closest\s*\{[^}]*grid-column:\s*2\s*\/\s*-1/s);
});

test("the default example gives 2 found and 2 missing", () => {
  const quotes = parseQuotes(DEFAULT_QUOTES);
  assert.equal(quotes.length, 4);
  const report = checkQuotes(quotes, DEFAULT_SOURCE);
  assert.equal(report.found, 2);
  assert.equal(report.missing, 2);
  assert.equal(report.results[0].match !== null, true, 'at least 18 years old - and "legal residents" is found');
  assert.equal(report.results[1].match, null, "at least 21 years old is not");
  assert.equal(report.results[2].match, null, "the dropped not is not forgiven");
  assert.equal(report.results[3].match !== null, true, "参赛对象:在校学生 is found");

  const closeMiss = explainMiss(quotes[1], DEFAULT_SOURCE);
  assert.equal(closeMiss.status, "close");
  assert.equal(closeMiss.differences[0].source, "18");
  const dropped = explainMiss(quotes[2], DEFAULT_SOURCE);
  assert.equal(dropped.status, "close");
  assert.ok(dropped.differences[0].source.includes("not"));
});

test("docs/verbatim-quote.js is a byte-identical copy of index.js", () => {
  assert.equal(
    readFileSync(path.join(root, "docs", "verbatim-quote.js"), "utf8"),
    readFileSync(path.join(root, "index.js"), "utf8"),
  );
});

test("the three playground files make no external requests and never assign HTML", () => {
  const mastheadLinks = [
    "https://github.com/ninondev/verbatim-quote",
    "https://www.npmjs.com/package/verbatim-quote",
  ];
  for (const file of ["docs/index.html", "docs/playground.js", "docs/verbatim-quote.js"]) {
    const content = readFileSync(path.join(root, file), "utf8");
    assert.ok(!content.includes("innerHTML"), `${file} must not use innerHTML`);
    const urls = [...content.matchAll(/https?:\/\/[^\s"'`)<]+/g)].map((m) => m[0]);
    for (const url of urls) {
      assert.ok(mastheadLinks.includes(url), `${file} contains an unexpected address: ${url}`);
    }
    if (file !== "docs/index.html") {
      assert.equal(urls.length, 0, `${file} must contain no address at all`);
    }
  }
});
