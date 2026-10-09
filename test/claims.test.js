// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findQuote } from "../index.js";

test("public descriptions promise explicit folding rules without semantic guarantees", () => {
  const forbidden = [
    ["Wording ", "never is"], ["Never ", "wording"], ["never ", "wording"],
    ["forgives only what cannot ", "change the meaning"], ["Never forgives a changed", ", added or dropped word"],
    ["Never forgiven: a changed", ", added or dropped word"], ["anything ", "Unicode"],
  ].map((pieces) => pieces.join(""));
  for (const file of ["README.md", "package.json", "CHANGELOG.md", "index.js", "docs/index.html"]) {
    const content = readFileSync(new URL("../" + file, import.meta.url), "utf8");
    for (const phrase of forbidden) assert.ok(!content.includes(phrase), `${file}: ${phrase}`);
  }
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /prime/);
  assert.match(readme, /Intl\.Segmenter/);
  assert.match(readme, /not what they mean/);
});

test("prime and minus equivalences demonstrate why folding is not semantic validation", () => {
  assert.ok(findQuote("5'", "5′"));
  assert.ok(findQuote('-18', '−18'));
});

test("the README embeds both heroes with approved visible wording", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const embed = `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/hero-dark.svg">
  <img src="docs/hero-light.svg" width="100%" alt="One sentence from a web page and two quotes of it. The first quote differs only in its dash and quotation marks: includes() misses it, verbatim-quote finds it. The second has 21 where the page says 18: a similarity score accepts it, verbatim-quote rejects it.">
</picture>`;
  assert.ok(readme.includes(embed));
  for (const theme of ["light", "dark"]) {
    const svg = readFileSync(new URL(`../docs/hero-${theme}.svg`, import.meta.url), "utf8");
    const visible = [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) => match[1]).join(" ");
    for (const text of ["Typography folds by listed rules. Words and numbers must match.",
      "typography folded by rule", "a changed number does not match"]) assert.ok(visible.includes(text), theme);
    assert.doesNotMatch(visible, /\bmeaning\b|never wording|wording is never forgiven/i);
  }
});

test("the first screen links once to the hosted playground", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const first = readme.split("## Why not")[0];
  assert.doesNotMatch(first, /\]\(docs\/index\.html\)/);
  assert.doesNotMatch(first, /pending account configuration/);
  assert.equal([...first.matchAll(/\]\(https:\/\/[^)]+\.github\.io\/verbatim-quote\/\)/g)].length, 1);
  assert.match(first, /\[Try it in the playground\]/);
});

test("the first screen states runtime requirements in reader-facing language", () => {
  const first = readFileSync(new URL("../README.md", import.meta.url), "utf8").split("## Why not")[0];
  assert.match(first, /Node 22 or later/);
  assert.match(first, /Intl\.Segmenter/);
  assert.doesNotMatch(first, /is declared|not verified|Node test suite/);
});

test("compatibility history refers to development versions", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /as versions before 1\.0 did/);
  assert.match(readme, /NFKC, as earlier development versions did/);
});

test("whitespace options preserve original boundaries in behaviour and documentation", () => {
  assert.equal(findQuote("8 days", "1 8 days", { whitespace: "ignore" })?.start, 2);
  assert.equal(findQuote("eligi", "eligi-\nble", { whitespace: "ignore" })?.text, "eligi");
  for (const file of ["README.md", "index.d.ts"]) {
    const content = readFileSync(new URL("../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(content, /drops whitespace entirely/);
    assert.match(content, /source whitespace still separates words/);
  }
});

test("types distinguish default ligature folding from optional broad compatibility", () => {
  const types = readFileSync(new URL("../index.d.ts", import.meta.url), "utf8");
  assert.ok(findQuote("final", "ﬁnal", { compatibility: false }));
  assert.match(types, /Latin ligatures.*regardless of this option/);
  assert.doesNotMatch(types, /compatibility folding is restricted.*and Latin ligatures/);
});

test("diagnostic descriptions condition suggestions on a close result", () => {
  const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  assert.match(changelog, /--explain.*close diagnosis/s);
  const cli = readFileSync(new URL("../bin/verbatim-quote.js", import.meta.url), "utf8");
  assert.match(cli, /With --explain, a close diagnosis/);
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /Signs `\+`, `-` and `−` attach directly/);
  assert.match(readme, /when the following group has exactly three digits/);
});
