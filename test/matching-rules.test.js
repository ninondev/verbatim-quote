// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { findQuote, normalize } from "../index.js";

test("joining punctuation inside either match edge cannot cut a word or number", () => {
  for (const [quote, source] of [
    ["18.", "18.5"], [".5", "18.5"], ["1,", "1,000"], [",000", "1,000"],
    ["can'", "can't"], ["'t", "can't"], ["non-", "non-refundable"], ["-refundable", "non-refundable"],
    ["example.", "example.com"], [".com", "example.com"], ["18:", "18:30"], [":30", "18:30"],
    ["1/", "1/2"], ["/2", "1/2"], ["18–", "18–25"], ["–25", "18–25"],
    ["１８．", "１８．５"], ["．５", "１８．５"], ["+", "+18"], ["%", "18%"],
  ]) {
    assert.equal(findQuote(quote, source), null, JSON.stringify({ quote, source }));
    assert.ok(findQuote(quote, source, { boundary: "none" }), "explicit substring mode");
  }
  assert.equal(findQuote("at least 18. ... years", "at least 18.5 years", { allowEllipsis: true, minPart: 3 }), null);
});

test("sentence punctuation, quoted words and complete numbers remain matchable", () => {
  for (const [quote, source] of [
    ["18.", "at least 18. Then go"], ["best", "the 'best' one"], ["-18", "-18 degrees"],
    ["1,000", "prize 1,000"], ["18.5", "18.5 years"], ["18%", "18%"], ["can't", "can't"],
    ["non-refundable", "non-refundable deposit"],
  ]) assert.ok(findQuote(quote, source), JSON.stringify({ quote, source }));
});

test("supplementary-plane letters match whole clusters with UTF-16 offsets", () => {
  for (const quote of ["𐐀", "𐐀𐐁", "𝔘", "𠀀", "a\u0305", "👩‍👩‍👧"]) {
    const source = `prefix ${quote} suffix`;
    const match = findQuote(quote, source);
    assert.ok(match, quote);
    assert.equal(match.start, 7);
    assert.equal(match.end, 7 + quote.length);
    assert.equal(source.slice(match.start, match.end), quote);
    assert.equal(findQuote(quote, quote)?.end, quote.length);
  }
  assert.equal(findQuote("𐐀", "𐐀𐐁"), null, "a whole cluster still cannot split a word");
});

test("ignored whitespace preserves source word boundaries and numeric attachments", () => {
  const options = { whitespace: "ignore" };
  for (const space of [" ", "\t", "\r\n", "\u00a0", "  \n "]) {
    const source = `are${space}eligible${space}today`;
    const match = findQuote("eligible", source, options);
    assert.ok(match, JSON.stringify(space));
    assert.equal(source.slice(match.start, match.end), "eligible");
    assert.ok(findQuote("are eligible today", source, options));
    assert.ok(findQuote("18", `age${space}18${space}years`, options));
    assert.equal(findQuote("18", `temperature${space}-18${space}degrees`, options), null);
  }
  assert.equal(findQuote("eligible", "ineligible", options), null);
  assert.equal(findQuote("18", "18.5", options), null);
  assert.equal(findQuote("eligible", "in\u200beligible", options), null, "removed invisibles are still transparent");
});

test("ordinary exact search has no ellipsis placement budget", () => {
  const source = "18% ".repeat(200001) + "18";
  const match = findQuote("18", source);
  assert.ok(match, "a valid occurrence after 200,001 rejected occurrences must be found");
  assert.equal(match.start, source.length - 2);
  assert.equal(match.end, source.length);
});

test("minPart applies even when an ellipsis leaves just one non-empty piece", () => {
  for (const quote of ["... a", "a ...", "... a ...", "… a", "a […]"]) {
    assert.equal(findQuote(quote, "a", { allowEllipsis: true }), null, quote);
    assert.ok(findQuote(quote, "a", { allowEllipsis: true, minPart: 1 }), quote);
  }
  assert.ok(findQuote("a", "a", { allowEllipsis: true }), "a literal quote has no ellipsis minimum");
});

test("ASCII controls and CRLF keep their original spans and folding maps", () => {
  for (const prefix of ["", "🏆"]) {
    const source = prefix + "A\r\nB!";
    for (const whitespace of ["collapse", "ignore"]) {
      const match = findQuote("a b", source, { ignoreCase: true, whitespace });
      assert.ok(match);
      assert.equal(match.start, prefix.length);
      assert.equal(match.end, prefix.length + 4);
      assert.equal(match.text, "A\r\nB");
    }
    assert.equal(findQuote("ab", prefix + "a\x00b", { whitespace: "ignore" }), null);
    assert.equal(findQuote("\x00", prefix + "a\x00b")?.start, prefix.length + 1);
  }
  const folded = normalize("\r\nA\r\nB\r\n");
  assert.equal(folded.text, "A B");
  assert.deepEqual(folded.starts, [2, 3, 5]);
  assert.deepEqual(folded.ends, [3, 4, 6]);
});
