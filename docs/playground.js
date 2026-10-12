// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
// verbatim-quote playground. The helpers above the DOM layer are pure and exported, so
// node --test can run them; everything below only touches the document. No build step,
// no external requests, no analytics. All input text is set with textContent, never HTML.

export const DEFAULT_SOURCE =
  "Who can participate\n" +
  "Entrants must be at least 18 years old — and “legal residents” of an eligible country.\n" +
  "Teams of up to four people. Entries must not be shared publicly before judging ends.\n" +
  "\n" +
  "参赛对象：在校学生，年满 18 周岁。\n";

export const DEFAULT_QUOTES =
  "at least 18 years old - and \"legal residents\"\n" +
  "at least 21 years old\n" +
  "Entries must be shared publicly before judging ends\n" +
  "参赛对象:在校学生\n";

/** One quote per line; blank lines carry no quote. */
export function parseQuotes(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

/** The checkbox state of the page, as library options. */
export function optionsFrom(toggles) {
  return {
    ignoreCase: Boolean(toggles.ignoreCase),
    whitespace: toggles.ignoreWhitespace ? "ignore" : "collapse",
    allowEllipsis: Boolean(toggles.allowEllipsis),
    compatibility: Boolean(toggles.compatibility),
  };
}

/** Merge overlapping or adjacent spans into the segments to mark, in order. */
export function buildSegments(spans) {
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const segments = [];
  for (const [start, end] of sorted) {
    const last = segments[segments.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else segments.push([start, end]);
  }
  return segments;
}

/** The summary line under the options. */
export function summaryText(found, total) {
  return `${found} of ${total} quotes are in the source.`;
}

/** Where the closest passage of a miss differs: the source side of every difference. */
export function differenceSpans(differences) {
  return buildSegments(differences.filter((d) => d.end > d.start).map((d) => [d.start, d.end]));
}

/**
 * Where the quote itself differs: offsets of every non-empty `quote` side, found in the
 * quote in order. The source side is outlined in the closest passage; this outlines the
 * quote's own words in the row. Ambiguous repeated text and sides that do not appear
 * verbatim (case folding, for instance) are skipped rather than guessed.
 */
export function quoteDifferenceSpans(quote, differences) {
  const spans = [];
  let from = 0;
  for (const difference of differences) {
    if (!difference.quote) continue;
    const at = quote.indexOf(difference.quote);
    if (at >= from && quote.indexOf(difference.quote, at + 1) < 0) {
      spans.push([at, at + difference.quote.length]);
      from = at + difference.quote.length;
    }
  }
  return buildSegments(spans);
}

// ---- DOM layer --------------------------------------------------------------

function text(parent, value) {
  const node = document.createElement("span");
  node.textContent = value;
  parent.append(node);
  return node;
}

function passageWithDifferences(root, passage, passageStart, spans, className) {
  let cursor = passageStart;
  const passageEnd = passageStart + passage.length;
  for (const [from, to] of spans) {
    const start = Math.max(cursor, from);
    const end = Math.min(passageEnd, to);
    if (end <= start) continue;
    if (start > cursor) text(root, passage.slice(cursor - passageStart, start - passageStart));
    const outlined = text(root, passage.slice(start - passageStart, end - passageStart));
    outlined.className = className;
    cursor = end;
  }
  if (cursor < passageEnd) text(root, passage.slice(cursor - passageStart));
}

async function main() {
  if (!("Segmenter" in Intl)) {
    document.getElementById("summary").textContent =
      "This browser has no Intl.Segmenter, which verbatim-quote needs, so the playground cannot run here.";
    return;
  }
  const { checkQuotes, explainMiss } = await import("./verbatim-quote.js");

  const sourceInput = document.getElementById("source");
  const quotesInput = document.getElementById("quotes");
  const summary = document.getElementById("summary");
  const rows = document.getElementById("rows");
  const written = document.getElementById("written");
  const toggles = ["ignore-case", "ignore-whitespace", "allow-ellipsis", "compatibility"].map((id) =>
    document.getElementById(id),
  );
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  sourceInput.value = DEFAULT_SOURCE;
  quotesInput.value = DEFAULT_QUOTES;

  function render() {
    const source = sourceInput.value;
    const quotes = parseQuotes(quotesInput.value);
    const options = optionsFrom({
      ignoreCase: toggles[0].checked,
      ignoreWhitespace: toggles[1].checked,
      allowEllipsis: toggles[2].checked,
      compatibility: toggles[3].checked,
    });
    const report = checkQuotes(quotes, source, options);
    summary.textContent = summaryText(report.found, quotes.length);

    rows.replaceChildren();
    for (const result of report.results) {
      const row = document.createElement(result.match ? "button" : "li");
      row.type = result.match ? "button" : undefined;
      row.className = result.match ? "found" : "missing";
      const sign = text(row, result.match ? "✓" : "✗");
      sign.className = `sign ${result.match ? "ok" : "no"}`;
      if (result.match) {
        text(row, result.quote);
        const offsets = text(row, `${result.match.start}–${result.match.end}`);
        offsets.className = "offsets";
        row.addEventListener("click", () => highlight(result.match.start));
      } else {
        const miss = explainMiss(result.quote, source, options);
        const quoteText = document.createElement("span");
        if (miss && miss.status === "close") {
          passageWithDifferences(
            quoteText,
            result.quote,
            0,
            quoteDifferenceSpans(result.quote, miss.differences),
            "diff",
          );
        } else {
          quoteText.textContent = result.quote;
        }
        row.append(quoteText);
        const status = text(row, "not in the source");
        status.className = "status";
        if (miss && miss.status === "close") {
          const closest = document.createElement("div");
          closest.className = "closest";
          text(closest, "closest: ");
          passageWithDifferences(
            closest,
            miss.nearest.text,
            miss.nearest.start,
            differenceSpans(miss.differences),
            "diff",
          );
          row.append(closest);
        }
      }
      rows.append(row);
    }

    written.replaceChildren();
    const segments = buildSegments(
      report.results.filter((result) => result.match).map((result) => [result.match.start, result.match.end]),
    );
    let cursor = 0;
    for (const [start, end] of segments) {
      if (start > cursor) text(written, source.slice(cursor, start));
      const mark = document.createElement("mark");
      mark.textContent = source.slice(start, end);
      mark.dataset.start = start;
      mark.dataset.end = end;
      written.append(mark);
      cursor = end;
    }
    if (cursor < source.length) text(written, source.slice(cursor));
  }

  function highlight(start) {
    for (const mark of written.querySelectorAll("mark")) {
      if (Number(mark.dataset.start) <= start && start < Number(mark.dataset.end)) {
        mark.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" });
        mark.classList.add("outline");
        setTimeout(() => mark.classList.remove("outline"), 1000);
        return;
      }
    }
  }

  let timer = 0;
  for (const input of [sourceInput, quotesInput]) {
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(render, 150);
    });
  }
  for (const box of toggles) box.addEventListener("change", render);
  render();
}

if (typeof document !== "undefined") main();
