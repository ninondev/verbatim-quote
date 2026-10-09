// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuotes, createMatcher, findQuote, normalize, sentenceAt, splitSentences, verifyQuote } from "../index.js";

const RULES =
  "Who can participate\n" +
  "Participants must be at least 18 years old — and “legal residents” of an eligible country.\n" +
  "Teams of up to four   people may enter.";

test("typography is forgiven and the span points at the original text", () => {
  const quote = 'must be at least 18 years old - and "legal residents"';
  const match = findQuote(quote, RULES);
  assert.ok(match);
  assert.equal(match.text, "must be at least 18 years old — and “legal residents”");
  assert.equal(RULES.slice(match.start, match.end), match.text);
  assert.ok(verifyQuote("Teams of up to four people may enter.", RULES), "no-break space and runs of spaces");
});

test("a changed, added or dropped word is never forgiven", () => {
  assert.equal(findQuote("must be at least 21 years old", RULES), null);
  assert.equal(findQuote("must be 18 years old", RULES), null);
  assert.equal(findQuote("Participants must be at least 18 years of age", RULES), null);
  assert.equal(findQuote("   ", RULES), null, "an empty quote proves nothing");
});

test("full-width punctuation matches, and whitespace can be ignored for Chinese text", () => {
  const source = "参赛对象：全国高校在校学生（含本、专、研）。";
  assert.ok(verifyQuote("参赛对象:全国高校在校学生", source));
  assert.equal(findQuote("参赛对象: 全国高校在校学生", source), null);
  const match = findQuote("参赛对象: 全国 高校在校学生", source, { whitespace: "ignore" });
  assert.equal(match?.text, "参赛对象：全国高校在校学生");
});

test("ligatures, decomposed accents and invisible characters map back to the original", () => {
  const source = "The ﬁnal round is at the café. Only eli\u00ADgible teams.";
  assert.equal(findQuote("final round", source)?.text, "ﬁnal round");
  assert.equal(findQuote("the café", source)?.text, "the café");
  assert.equal(findQuote("Only eligible teams", source)?.text, "Only eli\u00ADgible teams");
});

test("characters outside the basic plane keep their offsets", () => {
  const source = "Win \u{1F3C6} prizes and \u{1F4B0} cash";
  const match = findQuote("\u{1F4B0} cash", source);
  assert.equal(match?.text, "\u{1F4B0} cash");
  assert.equal(match?.start, source.indexOf("\u{1F4B0}"));
});

test("case is kept unless asked", () => {
  assert.equal(findQuote("TEAMS OF UP TO", RULES), null);
  assert.equal(findQuote("TEAMS OF UP TO", RULES, { ignoreCase: true })?.text, "Teams of up to");
});

test("an ellipsis stands for a short gap only when allowed, with pieces in order", () => {
  const quote = "Participants must be at least 18 … of an eligible country";
  assert.equal(findQuote(quote, RULES), null);
  const match = findQuote(quote, RULES, { allowEllipsis: true });
  assert.equal(match?.parts.length, 2);
  assert.ok(match?.text.startsWith("Participants must") && match.text.endsWith("eligible country"));
  assert.equal(findQuote("of an eligible country ... Participants must be", RULES, { allowEllipsis: true }), null, "order");
  assert.equal(findQuote("Participants ... country", RULES, { allowEllipsis: true }), null, "pieces too short");
  assert.equal(findQuote("Who can participate ... four people may enter", RULES, { allowEllipsis: true, maxGap: 20 }), null, "gap");
});

test("a later occurrence is tried when the first cannot complete the quote", () => {
  const source = "Open to students. Deadline soon. Open to everyone who is 18 or older.";
  const match = findQuote("Open to everyone ... is 18 or older", source, { allowEllipsis: true, minPart: 5 });
  assert.equal(match?.start, source.lastIndexOf("Open to"));
});

test("an ellipsis search backtracks to a later occurrence of a middle part", () => {
  const source = "AAAAA BBBBB xxxxxxx BBBBB xxxxxxxx CCCCC";
  const match = findQuote("AAAAA ... BBBBB ... CCCCC", source, { allowEllipsis: true, minPart: 5, maxGap: 20 });
  assert.ok(match, "the first BBBBB cannot reach CCCCC; the second one can (gaps 15 and 10)");
  assert.deepEqual(
    match.parts.map((part) => [part.start, part.end]),
    [[0, 5], [20, 25], [35, 40]],
  );
});

test("every ellipsis piece obeys the same word and number boundaries", () => {
  for (const [quote, source] of [
    ["Alpha ... eligible ... Omega", "Alpha ineligible Omega"],
    ["Alpha ... 18 is great", "Alpha iPhone18 is great"],
    ["Alpha ine ... Omega", "Alpha ineligible Omega"],
  ]) {
    assert.equal(findQuote(quote, source, { allowEllipsis: true, minPart: 3 }), null);
    assert.ok(findQuote(quote, source, { allowEllipsis: true, minPart: 3, boundary: "none" }));
  }
  const options = { allowEllipsis: true, minPart: 5, maxGap: 20 };
  assert.equal(findQuote("AAAAA ... CCCCC", "AAAAA xxxxxxxxxxxxxxxxxxxxxxxxxxxxx CCCCC", options), null);
  assert.deepEqual(findQuote("AAAAA ... CCCCC", "AAAAA xxxxxxxxxxxxxx CCCCC", options)?.parts,
    [{ start: 0, end: 5 }, { start: 21, end: 26 }]);
});

test("fifty parts against a megabyte of repeated text match all expected spans", () => {
  const chunk = "lorem ipsum dolor sit amet consectetur adipiscing elit ";
  const source = chunk.repeat(Math.ceil((1024 * 1024) / chunk.length));
  const quote = Array.from({ length: 50 }, () => "lorem ipsum dolor sit amet").join(" ... ");
  const match = findQuote(quote, source, { allowEllipsis: true });
  assert.ok(match, "the parts appear in order with gaps far below maxGap");
  assert.deepEqual(match.parts, Array.from({ length: 50 }, (_, i) => ({
    start: i * chunk.length, end: i * chunk.length + "lorem ipsum dolor sit amet".length,
  })));
});

test("an ellipsis search over the step limit returns no match instead of running on", () => {
  const source = "x".repeat(1000000);
  const match = findQuote("xxxxxxxxxx ... xxxxxxxxxx", source, { allowEllipsis: true });
  assert.equal(match, null, "every occurrence is rejected by the boundary rules, so the limit ends the search");
});

test("one matcher checks many quotes, and checkQuotes keeps the caller's fields", () => {
  const matcher = createMatcher(RULES);
  assert.ok(matcher.verify("Who can participate"));
  assert.ok(!matcher.verify("Who may participate"));
  const report = checkQuotes([{ rule: "age", quote: "at least 18 years old" }, { rule: "team", quote: "teams of four" }, "up to four"], RULES);
  assert.equal(report.found, 2);
  assert.equal(report.missing, 1);
  assert.equal(report.results[0].rule, "age");
  assert.equal(report.results[1].match, null);
  assert.equal(report.results[2].quote, "up to four");
});

test("normalize keeps one entry per folded character", () => {
  const { text, starts, ends } = normalize("A—  b…");
  assert.equal(text, "A- b...");
  assert.equal(starts.length, text.length);
  assert.equal(ends.length, text.length);
});

test("sentences split on end punctuation but not on abbreviations, initials or decimals", () => {
  const source = "Open to U.S. residents. Dr. Smith judges round 2.5 of the contest! Prizes: $5,000. “Why?” Ask J. Doe.";
  assert.deepEqual(splitSentences(source).map((s) => s.text), [
    "Open to U.S. residents.",
    "Dr. Smith judges round 2.5 of the contest!",
    "Prizes: $5,000.",
    "“Why?”",
    "Ask J. Doe.",
  ]);
  for (const sentence of splitSentences(source)) assert.equal(source.slice(sentence.start, sentence.end), sentence.text);
});

test("Chinese sentences split without spaces, and lines split unless paragraph mode is asked", () => {
  assert.deepEqual(splitSentences("报名截止9月30日。须满18岁！可以组队吗？可以。").map((s) => s.text),
    ["报名截止9月30日。", "须满18岁！", "可以组队吗？", "可以。"]);
  const wrapped = "Participants must be\nat least 18.\n\nTeams may enter.";
  assert.deepEqual(splitSentences(wrapped).map((s) => s.text), ["Participants must be", "at least 18.", "Teams may enter."]);
  assert.deepEqual(splitSentences(wrapped, { lines: "paragraph" }).map((s) => s.text),
    ["Participants must be\nat least 18.", "Teams may enter."]);
});

test("sentenceAt returns the sentence around a match", () => {
  const match = findQuote("legal residents", RULES);
  assert.ok(match);
  assert.ok(sentenceAt(RULES, match.start)?.text.startsWith("Participants must be at least 18"));
  assert.equal(sentenceAt(RULES, RULES.length + 5), null);
});

test("a changed or dropped punctuation mark is never forgiven", () => {
  const source = "Ages 18-25 apply. Bring ID, water, and snacks; no pets.";
  assert.equal(findQuote("Ages 18 25 apply", source), null, "dash dropped");
  assert.equal(findQuote("Bring ID water", source), null, "comma dropped");
  assert.equal(findQuote("Bring ID; water", source), null, "comma changed to a semicolon");
  assert.equal(findQuote("snacks, no pets", source), null, "semicolon changed to a comma");
});

test("a changed negation is never forgiven, in English and in Chinese", () => {
  assert.equal(verifyQuote("Teams that did register may enter", "Teams that did not register may enter."), false, "not dropped");
  assert.equal(verifyQuote("Late teams may not enter", "Late teams may enter."), false, "not added");
  assert.equal(verifyQuote("no pets are allowed", "Pets are allowed."), false, "no dropped");
  assert.equal(verifyQuote("未成年人能参加", "未成年人不能参加。"), false, "不 dropped");
  assert.equal(verifyQuote("未成年人不能参加", "未成年人能参加。"), false, "不 added");
  assert.equal(verifyQuote("未缴费者有资格参赛", "未缴费者没资格参赛。"), false, "没 changed to 有");
});

test("changed units, signs and decimal points are never forgiven", () => {
  assert.equal(verifyQuote("must be 18 months old", "Participants must be 18 years old."), false, "unit changed");
  assert.equal(verifyQuote("The pool is 50 km long", "The pool is 50 m long."), false, "unit changed");
  assert.equal(verifyQuote("range from 5 to 10", "Temperatures range from -5 to 10."), false, "minus sign dropped");
  assert.equal(verifyQuote("range from -5 to -10", "Temperatures range from -5 to 10."), false, "minus sign added");
  assert.equal(verifyQuote("Round 25 starts", "Round 2.5 starts at noon."), false, "decimal point dropped");
  assert.equal(verifyQuote("Round 2.6 starts", "Round 2.5 starts at noon."), false, "decimal changed");
  assert.equal(verifyQuote("须满19岁", "报名者须满18岁。"), false, "digit changed");
});

test("single curly quotes, zero-width space, BOM and ellipsis form are forgiven", () => {
  const source = "It’s a ‘test’ of Veri\u200B\u00ADfication\uFEFF.";
  const match = findQuote("It's a 'test' of Verification.", source);
  assert.ok(match);
  assert.equal(source.slice(match.start, match.end), match.text);
  assert.equal(match.text, "It’s a ‘test’ of Veri\u200B\u00ADfication\uFEFF.");
  assert.ok(verifyQuote("Wait... or go.", "Wait… or go."), "… in the source matches ... in the quote");
});

test("CRLF line endings stay inside the reported span", () => {
  const source = "First line.\r\nSecond line, continued.\r\n";
  const match = findQuote("line. Second line", source);
  assert.ok(match);
  assert.equal(source.slice(match.start, match.end), "line.\r\nSecond line");
  assert.equal(match.text, "line.\r\nSecond line");
});

test("an expanded character matches only as a whole, and only under compatibility", () => {
  const source = "score ½ point";
  assert.equal(findQuote("score 1⁄2 point", source), null, "fractions do not fold by default");
  const match = findQuote("score 1⁄2 point", source, { compatibility: true });
  assert.equal(match?.text, source);
  assert.equal(match?.start, 0);
  assert.equal(match?.end, source.length);
});

test("sentences split on an ellipsis, and e.g. before a capital stays together", () => {
  const source = "Wait… Then decide. See the rules, e.g. Chapter 2, for details.";
  assert.deepEqual(splitSentences(source).map((s) => s.text), [
    "Wait…",
    "Then decide.",
    "See the rules, e.g. Chapter 2, for details.",
  ]);
});
