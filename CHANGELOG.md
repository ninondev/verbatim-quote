# Changelog

## 1.0.0

First public release, extracted from Opportunity Scout.

- `findQuote`, `verifyQuote`, `checkQuotes` and `createMatcher` check that a quote really appears
  in a source text and report offsets into the original.
- Folds the listed differences before exact comparison: quote marks, dash variants, whitespace runs, width forms
  (U+FF00 to U+FFEF), the Latin ligatures, the ellipsis character, composed/decomposed accents
  and invisible characters (soft hyphen, zero-width space, word joiner, BOM; the zero-width
  joiner and non-joiner are kept, because they change words). Superscripts, fractions, circled
  numbers and Roman numeral characters are not folded: `1` does not match `½`, `x2` does not
  match `x²`. `compatibility: true` folds every character with NFKC, as development versions
  did.
- A match covers whole grapheme clusters. The default `boundary: "word"` rejects the specified
  word and number joins:
  `18` does not match `at least 180 days`, `can` does not match `can't`. `boundary: "none"`
  skips word and number boundary checks. Folding does not validate meaning; prime and minus
  symbols are among the characters folded by default.
- Options: `ignoreCase`, `whitespace` (`collapse`/`ignore`), `allowEllipsis` with `maxGap` and
  `minPart` (the search tries every valid placement, with backtracking, and gives up after
  200,000 steps), `compatibility`, `boundary`.
- Sentence helpers: `splitSentences` and `sentenceAt`, with `lines: "split"` (default) or
  `"paragraph"`.
- `explainMiss(quote, source, options)` can diagnose a missing quote: a close result includes a
  passage (offsets into the original), the edit distance, and up to ten differences (`changed`,
  `added` or `dropped`, seen from the quote). Bounded and deterministic; `"limit"` when the
  folded lengths multiply over 50,000,000. A rule-rejected exact substring does not hide other
  close passages; if none exists, it is widened to whole words/numbers before reporting edits.
- `normalize` exposed for callers that need the folded text and its offsets.
- Playground: a static page in `docs/` (can be served on GitHub Pages) to try the library on your own
  text, with the suggested passage and differences for close diagnoses.
- CLI: `bin/verbatim-quote.js` with `--ignore-case`, `--ellipsis`, `--ignore-whitespace`,
  `--json`; `--quotes <quotes.json|->` checks many quotes in one run; `--explain` adds a
  suggested passage and its first difference when a missing quote has a close diagnosis;
  `--` ends the flags so a quote
  may start with `--`; unknown flags, missing or extra arguments and unreadable files exit 2
  with a message; exit code 0 found, 1 not found, 2 bad usage.
- Zero runtime dependencies; TypeScript types included.
