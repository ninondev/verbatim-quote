// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { findQuote } from "../index.js";

for (const separator of ["\u00a0", "\u202f", "\u2009"]) {
  test(`three-digit groups joined by U+${separator.codePointAt(0).toString(16)} cannot be cut`, () => {
    const source = `prize 1${separator}000${separator}000`;
    for (const whitespace of ["collapse", "ignore"]) {
      for (const quote of ["1", "000", `1${separator}000`, "1'000"]) {
        const text = quote === "1'000" ? `prize 1'000${separator}000` : source;
        assert.equal(findQuote(quote, text, { whitespace }), null, quote);
        assert.ok(findQuote(quote, text, { whitespace, boundary: "none" }), quote);
      }
      assert.ok(findQuote(`1${separator}000${separator}000`, source, { whitespace }));
      assert.ok(findQuote("1", `1${separator}00`, { whitespace }), "two digits do not form a grouped separator");
      assert.ok(findQuote("1", `1${separator}0000`, { whitespace }), "four digits do not form a grouped separator");
    }
    assert.equal(findQuote("1", "1'000"), null);
    assert.ok(findQuote("1'000", "prize 1'000"));
  });
}

for (const dash of ["\u2012", "\u2014", "\u2015", "\u2212"]) {
  test(`U+${dash.codePointAt(0).toString(16)} joins digits at both edges`, () => {
    const source = `ages 10${dash}18`;
    for (const quote of ["10", "18", `10${dash}`, `${dash}18`]) assert.equal(findQuote(quote, source), null, quote);
    assert.ok(findQuote(`10${dash}18`, source));
  });
}

for (const sign of ["+", "-", "−"]) {
  test(`${sign} attaches after punctuation and joins numbers on both sides`, () => {
    for (const prefix of ["", " ", "x=", "“", "_", "1"]) {
      const source = `${prefix}${sign}18`;
      assert.equal(findQuote("18", source), null, source);
      assert.equal(findQuote(`${prefix}${sign}`, source), null, source);
    }
    assert.ok(findQuote(`${sign}18`, `x=${sign}18`));
  });
}

test("a match never cuts an uncomposable combining mark or CRLF grapheme", () => {
  assert.equal(findQuote("a", "a\u0305"), null);
  assert.equal(findQuote("\r", "A\r\nB"), null);
  assert.ok(findQuote("a\u0305", "a\u0305"));
  assert.equal(findQuote("A B", "A\r\nB")?.text, "A\r\nB");
});
