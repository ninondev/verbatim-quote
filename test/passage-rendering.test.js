// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainMiss } from "../index.js";
import { DEFAULT_SOURCE, DEFAULT_QUOTES, parseQuotes, quoteDifferenceSpans } from "../docs/playground.js";

test("ambiguous repeated quote words are not highlighted at a guessed occurrence", () => {
  const quote = "old old items are listed";
  const miss = explainMiss(quote, "old new items are listed");
  assert.equal(miss.status, "close");
  assert.equal(miss.differences[0].quote, "old");
  assert.deepEqual(quoteDifferenceSpans(quote, miss.differences), []);
});

test("rendering a closest passage preserves all text at a nonzero source offset", async () => {
  class Element {
    children = [];
    value = "";
    checked = false;
    dataset = {};
    content = "";
    events = {};
    append(node) { this.children.push(node); }
    replaceChildren() { this.children = []; this.content = ""; }
    addEventListener(name, callback) { this.events[name] = callback; }
    set textContent(value) { this.content = value; this.children = []; }
    get textContent() { return this.content + this.children.map((child) => child.textContent).join(""); }
  }
  const elements = Object.fromEntries([
    "summary", "source", "quotes", "rows", "written", "ignore-case", "ignore-whitespace", "allow-ellipsis", "compatibility",
  ].map((id) => [id, new Element()]));
  globalThis.document = { getElementById: (id) => elements[id], createElement: () => new Element() };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  try {
    await import("../docs/playground.js?dom-regression");
    await new Promise(setImmediate);
    const miss = explainMiss(parseQuotes(DEFAULT_QUOTES)[1], DEFAULT_SOURCE);
    assert.ok(miss.nearest.start > 0);
    const closest = elements.rows.children[1].children.find((child) => child.className === "closest");
    assert.ok(closest, "the DOM render must actually run");
    assert.equal(closest.textContent, "closest: " + miss.nearest.text);
    elements.source.value = "prefix must be at least very 18 years old";
    elements.quotes.value = "must be at least 18 years old";
    elements["ignore-case"].events.change();
    const dropped = explainMiss(elements.quotes.value, elements.source.value);
    const second = elements.rows.children[0].children.find((child) => child.className === "closest");
    assert.equal(second.textContent, "closest: " + dropped.nearest.text);
    elements.source.value = "... at least 180 days";
    elements.quotes.value = "at least 18";
    elements["ignore-case"].events.change();
    const numeric = elements.rows.children[0].children.find((child) => child.className === "closest");
    assert.equal(numeric.textContent, "closest: at least 180");
    assert.ok(numeric.children.some((child) => child.textContent === "180" && child.className === "diff"));
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});
