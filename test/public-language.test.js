// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("public tests describe behavior without private process history", () => {
  const phrases = [
    ["this ", "round"], ["failed until ", "the folding"], ["finish", "-line"],
    ["maintainer ", "reviews it"], ["the release ", "checklist"], ["round's ", "additions"],
  ].map((pieces) => pieces.join(""));
  for (const file of ["cases", "packaging", "playground", "tree", "export"]) {
    const content = readFileSync(new URL(`./${file}.test.js`, import.meta.url), "utf8");
    for (const phrase of phrases) assert.ok(!content.includes(phrase), `${file}: ${phrase}`);
  }
});
