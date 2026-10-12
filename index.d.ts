// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
export interface MatchOptions {
  /** Compare case-insensitively. Default false. */
  ignoreCase?: boolean;
  /** "collapse" (default) treats any run of whitespace as one space in comparison; "ignore" omits it from comparison. In both modes, source whitespace still separates words for boundary checks. */
  whitespace?: "collapse" | "ignore";
  /** Accept "..." or "…" in the quote as a gap; the pieces must appear in order. Default false. */
  allowEllipsis?: boolean;
  /** Largest gap an ellipsis may stand for, in folded UTF-16 units. Default 300. */
  maxGap?: number;
  /** Shortest piece allowed around an ellipsis, in folded UTF-16 units. Default 10. */
  minPart?: number;
  /** Fold every character with Unicode NFKC. Default false: NFKC applies only to width forms (U+FF00 to U+FFEF); superscripts, fractions, circled numbers and Roman numeral characters stay distinct. Latin ligatures U+FB00 to U+FB06 fold regardless of this option. */
  compatibility?: boolean;
  /** "word" (default): reject specified word/number joins, e.g. `18` inside `180`, `10-18` or `18%`. Unspaced scripts allow adjacent word-character substrings; the same checks apply to both ends of every ellipsis piece. "none": skip word/number boundary checks. */
  boundary?: "word" | "none";
}

export interface Span {
  /** UTF-16 offset of the first character in the original source. */
  start: number;
  /** UTF-16 offset just past the last character in the original source. */
  end: number;
}

export interface Match extends Span {
  /** `source.slice(start, end)`: the quote as it appears in the source. */
  text: string;
  /** One span per piece; a single span unless the quote had an ellipsis. */
  parts: Span[];
}

export interface Normalized {
  text: string;
  /** For every folded UTF-16 unit, where the original piece that produced it starts. */
  starts: number[];
  /** For every folded UTF-16 unit, where the original piece that produced it ends. */
  ends: number[];
  /** True at folded indexes that begin a grapheme cluster; a match may only begin there. */
  clusterStarts: boolean[];
  /** True at folded indexes where a grapheme cluster ends; a match may only end there. */
  clusterEnds: boolean[];
}

export interface Matcher {
  find(quote: string): Match | null;
  verify(quote: string): boolean;
}

export interface Sentence extends Span {
  text: string;
}

export interface SentenceOptions {
  /** "split" (default) ends a sentence at every line break; "paragraph" only at blank lines. */
  lines?: "split" | "paragraph";
}

export function normalize(text: string, options?: MatchOptions): Normalized;
export function createMatcher(source: string, options?: MatchOptions): Matcher;
export function findQuote(quote: string, source: string, options?: MatchOptions): Match | null;
export function verifyQuote(quote: string, source: string, options?: MatchOptions): boolean;
export function checkQuotes<T extends { quote?: unknown }>(
  items: Array<string | T>,
  source: string,
  options?: MatchOptions,
): {
  results: Array<{ quote: string; match: Match | null } | (T & { match: Match | null })>;
  found: number;
  missing: number;
};
export interface Difference {
  /** Seen from the quote: it changed, added or dropped something. */
  kind: "changed" | "added" | "dropped";
  /** The quote's side, "" for dropped. */
  quote: string;
  /** The source's side, "" for added; `source.slice(start, end)` equals it. */
  source: string;
  /** Where the source side sits in the original; equal for added. */
  start: number;
  end: number;
}

export interface Miss {
  /** "close": a similar passage exists, including a rule-rejected substring widened to whole words/numbers when no other close passage exists. "far": no suggestion within the distance limit. "limit": the input is too large to search. */
  status: "close" | "far" | "limit";
  /** The closest passage, with offsets into the original source. "close" only. */
  nearest?: { start: number; end: number; text: string };
  /** Code-point edit distance of the folded alignment. "close" only. */
  distance?: number;
  /** What differs, in quote order, at most 10. "close" only. */
  differences?: Difference[];
}

/**
 * When a quote is missing, suggest a passage and differences for a close diagnosis;
 * far/limit results have no suggestion. It never turns a miss into a match, and findQuote,
 * verifyQuote and checkQuotes are unchanged. Null when the quote is found or empty.
 */
export function explainMiss(quote: string, source: string, options?: MatchOptions): Miss | null;

export function splitSentences(source: string, options?: SentenceOptions): Sentence[];
export function sentenceAt(source: string, index: number, options?: SentenceOptions): Sentence | null;
