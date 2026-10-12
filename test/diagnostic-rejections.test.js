// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainMiss, findQuote } from "../index.js";

test("diagnostics refuse zero-edit passages rejected by matching rules", () => {
  for (const [quote, source, options] of [
    ["18.", "18.5"], ["eligible", "ineligible"],
    ["inal", "ﬁnal", { boundary: "none" }], ["..", "…", { boundary: "none" }],
  ]) {
    assert.equal(findQuote(quote, source, options), null);
    assert.deepEqual(explainMiss(quote, source, options), { status: "far" }, quote);
  }
});
