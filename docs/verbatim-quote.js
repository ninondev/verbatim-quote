// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
// verbatim-quote: find where a quote appears in a source text, character for character.
//
// Comparison is exact after the listed folding and boundary rules. These equivalences
// include prime and minus symbols and do not establish semantic equivalence.
// Every match is reported as offsets into the original source, so the caller
// can show or highlight the exact text.

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

// Invisible characters that carry no text: soft hyphen, zero-width space, word joiner, BOM.
// The zero-width joiner and non-joiner are NOT removed: they change words in several scripts
// and they hold emoji sequences together.
const INVISIBLE = /[­​⁠﻿]/g;
const SINGLE_QUOTES = /[‘’‚‛′`´]/g;
const DOUBLE_QUOTES = /[“”„‟″«»「」『』]/g;
const DASHES = /[‐-―−]/g;
const LIGATURES = /[ﬀ-ﬆ]/g;
const ELLIPSIS_CHAR = /…/g;
const SPACE = /\s/;
const ELLIPSIS = /\s*[[(]?\.{3,}[\])]?\s*/;

const DEFAULTS = {
  ignoreCase: false,
  whitespace: "collapse",
  allowEllipsis: false,
  maxGap: 300,
  minPart: 10,
  compatibility: false,
  boundary: "word",
};

// The folding is deliberately narrow: canonical composition, width forms (U+FF00 to U+FFEF),
// the Latin ligatures U+FB00 to U+FB06 and the ellipsis character U+2026, then the typography
// sets above. Superscripts, fractions, circled numbers, Roman numeral characters and the like
// stay what they are, because folding them would hide a change of meaning (`1` must not match
// `½`, `x2` must not match `x²`). With `compatibility: true`, NFKC applies to every character,
// as the old version did.
function fold(segment, options) {
  // Every folding step is the identity on plain ASCII, and long sources are mostly ASCII.
  if (/^[\x00-\x7F]+$/.test(segment)) return options.ignoreCase ? segment.toLowerCase() : segment;
  let text = segment.normalize("NFC");
  let out = "";
  for (const char of text) {
    const cp = char.codePointAt(0);
    out += options.compatibility || (cp >= 0xff00 && cp <= 0xffef) ? char.normalize("NFKC") : char;
  }
  // Width folding can decompose (half-width katakana voiced marks), so compose again:
  // ｶﾞ must equal ガ.
  text = out.normalize("NFC");
  text = text.replace(LIGATURES, (m) => m.normalize("NFKC")).replace(ELLIPSIS_CHAR, "...");
  text = text.replace(INVISIBLE, "").replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"').replace(DASHES, "-");
  return options.ignoreCase ? text.toLowerCase() : text;
}

// In ASCII, CRLF is the only multi-unit grapheme. Preserve it while avoiding the
// general Unicode segment iterator for long, entirely ASCII sources.
function* asciiGraphemes(text) {
  for (let index = 0; index < text.length; ) {
    const end = index + (text[index] === "\r" && text[index + 1] === "\n" ? 2 : 1);
    yield { segment: text.slice(index, end), index };
    index = end;
  }
}

/**
 * Fold a text for comparison and remember, for every folded UTF-16 unit, which part of the
 * original produced it. `clusterStarts[i]` is true when folded index i begins a grapheme
 * cluster, `clusterEnds[i]` when a grapheme cluster ends exactly at i: a match may only
 * begin and end on those marks, never inside a cluster that folded to several characters.
 */
export function normalize(text, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  let out = "";
  const starts = [];
  const ends = [];
  const clusterStarts = [];
  const clusterEnds = [];
  let pendingSpace = -1;
  const segments = /^[\x00-\x7F]*$/.test(text) ? asciiGraphemes(text) : graphemes.segment(text);
  for (const { segment, index } of segments) {
    const end = index + segment.length;
    let clusterFirst = -1;
    for (const char of fold(segment, opts)) {
      if (SPACE.test(char)) {
        if (opts.whitespace === "collapse" && pendingSpace < 0) pendingSpace = index;
        continue;
      }
      if (pendingSpace >= 0) {
        if (out.length > 0) {
          out += " ";
          starts.push(pendingSpace);
          ends.push(pendingSpace + 1);
          clusterStarts.push(true);
          clusterEnds.push(false);
        }
        pendingSpace = -1;
      }
      if (clusterFirst < 0) clusterFirst = out.length;
      out += char;
      for (let unit = 0; unit < char.length; unit += 1) {
        starts.push(index);
        ends.push(end);
        clusterStarts.push(false);
        clusterEnds.push(false);
      }
    }
    if (clusterFirst >= 0) {
      clusterStarts[clusterFirst] = true;
      clusterEnds[out.length] = true;
    }
  }
  return { text: out, starts, ends, clusterStarts, clusterEnds };
}

// Backtracking search over the placements of the quote's parts: every occurrence of a part
// is tried as long as it starts within maxGap of the previous part's end, and failed
// (part, position) states are remembered so repeated text cannot explode the work. A
// search that exceeds this many examined placements stops and reports no match; the limit
// is documented in the README.
const STEP_LIMIT = 200000;

function locate(haystack, parts, maxGap, isAligned, budgeted) {
  // A literal search must examine every occurrence; only gap placement is budgeted.
  if (!budgeted) {
    const part = parts[0];
    for (let at = haystack.indexOf(part); at >= 0; at = haystack.indexOf(part, at + 1)) {
      if (isAligned(0, at, at + part.length)) return [[at, at + part.length]];
    }
    return null;
  }
  let steps = 0;
  let aborted = false;
  const failed = new Set();

  function search(i, from, spans) {
    const part = parts[i];
    for (let at = haystack.indexOf(part, from); at >= 0; at = haystack.indexOf(part, at + 1)) {
      if (i > 0 && at - from > maxGap) break;
      steps += 1;
      if (steps > STEP_LIMIT) {
        aborted = true;
        return null;
      }
      if (failed.has(`${i}:${at}`)) continue;
      if (!isAligned(i, at, at + part.length)) continue;
      const next = spans.concat([[at, at + part.length]]);
      if (i === parts.length - 1) return next;
      const done = search(i + 1, at + part.length, next);
      if (done) return done;
      failed.add(`${i}:${at}`);
    }
    return null;
  }

  const spans = search(0, 0, []);
  return aborted ? null : spans;
}

// Boundary rules look at the characters of the original source around a match, folded the
// same way, while retaining original connector categories. Width forms count with
// their corresponding punctuation; numeric dashes also include figure, en, em,
// horizontal-bar and minus characters.
const APOSTROPHE = new Set([0x27, 0x2019, 0xff07]);
const HYPHEN = new Set([0x2d, 0x2010, 0x2011, 0xff0d]);
const FULL_STOP = new Set([0x2e, 0xff0e]);
const COMMA = new Set([0x2c, 0xff0c]);
const COLON = new Set([0x3a, 0xff1a]);
const SLASH = new Set([0x2f, 0xff0f]);
const NUMERIC_DASH = new Set([0x2012, 0x2013, 0x2014, 0x2015, 0x2212]);
const GROUP_SPACE = new Set([0xa0, 0x202f, 0x2009]);
const SIGN = new Set([0x2d, 0xff0d, 0x2b, 0xff0b, 0x2212]);
const PERCENT_LIKE = new Set([0x25, 0xff05, 0x2030, 0xb0]);
const WORD_CHAR = /[\p{L}\p{M}\p{N}\p{Pc}]/u;
const DECIMAL_DIGIT = /\p{Nd}/u;
// Scripts that are written without spaces between words; a quote may start and end
// inside them (`年满18周岁` contains `18`).
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

function boundaryContext(source, opts, haystack) {
  // Removed invisibles are transparent, but ignored source whitespace still separates words.
  // Classify only clusters at candidate edges, rather than allocating an object for every
  // source character. Long sources often need only a handful of these boundary lookups.
  const boundaryClusters = new Map();
  const clusterAt = (unit) => {
    if (unit < 0 || unit >= haystack.text.length) return null;
    let startUnit = unit;
    while (startUnit > 0 && !haystack.clusterStarts[startUnit]) startUnit -= 1;
    const cached = boundaryClusters.get(startUnit);
    if (cached) return cached;
    let endUnit = startUnit + 1;
    while (endUnit < haystack.text.length && !haystack.clusterStarts[endUnit]) endUnit += 1;
    const cluster = { text: haystack.text.slice(startUnit, endUnit), startUnit };
    const chars = [...cluster.text];
    cluster.word = chars.length > 0 && chars.every((c) => WORD_CHAR.test(c));
    cluster.digit = chars.length > 0 && chars.every((c) => DECIMAL_DIGIT.test(c));
    cluster.letterOrDigit = chars.some((c) => /[\p{L}\p{Nd}]/u.test(c));
    cluster.unspaced = chars.some((c) => UNSPACED_SCRIPT.test(c));
    cluster.whitespace = chars.length > 0 && chars.every((c) => /\s/.test(c));
    const cp = source.codePointAt(haystack.starts[cluster.startUnit]);
    cluster.apostrophe = APOSTROPHE.has(cp);
    cluster.hyphen = HYPHEN.has(cp);
    cluster.fullStop = FULL_STOP.has(cp);
    cluster.comma = COMMA.has(cp);
    cluster.colon = COLON.has(cp);
    cluster.slash = SLASH.has(cp);
    cluster.numericDash = NUMERIC_DASH.has(cp);
    cluster.groupSpace = GROUP_SPACE.has(cp);
    cluster.sign = SIGN.has(cp);
    cluster.percentLike = PERCENT_LIKE.has(cp);
    // Adjacent rejected occurrences reuse neighbours, without retaining the whole source.
    if (boundaryClusters.size >= 64) boundaryClusters.clear();
    boundaryClusters.set(startUnit, cluster);
    return cluster;
  };
  const separated = (left, right) => left && right && SPACE.test(source.slice(
    haystack.ends[left.startUnit + left.text.length - 1], haystack.starts[right.startUnit],
  ));
  const spaceBetween = (left, right) => ({
    whitespace: true, before: left, after: right,
    groupSpace: /^[\u00a0\u202f\u2009]$/.test(source.slice(
      haystack.ends[left.startUnit + left.text.length - 1], haystack.starts[right.startUnit],
    )),
  });
  const clusterBefore = (cluster) => {
    if (!cluster) return null;
    if (cluster.whitespace && cluster.startUnit === undefined) return cluster.before;
    const before = clusterAt(cluster.startUnit - 1);
    return separated(before, cluster) ? spaceBetween(before, cluster) : before;
  };
  const clusterAfter = (cluster) => {
    if (!cluster) return null;
    if (cluster.whitespace && cluster.startUnit === undefined) return cluster.after;
    const unit = cluster.startUnit + cluster.text.length;
    const after = clusterAt(unit);
    return separated(cluster, after) ? spaceBetween(cluster, after) : after;
  };

  // A connector can sit just inside the quote, too (`18.` in `18.5`).
  const threeDigits = (right) => {
    let count = 0;
    for (let cluster = right; cluster?.digit; cluster = clusterAfter(cluster)) {
      count += [...cluster.text].length;
      if (count > 3) return false;
    }
    return count === 3;
  };
  const connects = (left, middle, right) =>
    Boolean(left && middle && right && (
      ((middle.apostrophe || middle.hyphen || middle.fullStop) && left.word && right.word) ||
      ((middle.comma || middle.colon || middle.slash || middle.numericDash || middle.sign) && left.digit && right.digit) ||
      (middle.groupSpace && left.digit && right.digit && threeDigits(right))
    ));

  // The first or last character of a match is joined to its neighbour when one of the
  // boundary rules holds; the occurrence is then rejected and the search goes on. At the
  // edges of every piece the same rules apply, including pieces around an ellipsis.
  const joinedBefore = (unit) => {
    const info = clusterAt(unit);
    const p1 = clusterBefore(info);
    const p2 = clusterBefore(p1);
    if (!p1) return false;
    if (connects(p1, info, clusterAfter(info))) return true;
    if (info.percentLike && p1.digit) return true;
    if (p1.word && info.word && !p1.unspaced && !info.unspaced) return true;
    if (connects(p2, p1, info)) return true;
    return info.digit && p1.sign && (!p2 || !p2.letterOrDigit);
  };
  const joinedAfter = (lastUnit) => {
    const info = clusterAt(lastUnit);
    const n1 = clusterAfter(info);
    const n2 = clusterAfter(n1);
    if (!n1) return false;
    if (connects(clusterBefore(info), info, n1)) return true;
    const p1 = clusterBefore(info);
    if (info.sign && n1.digit && (!p1 || !p1.letterOrDigit)) return true;
    if (info.word && n1.word && !info.unspaced && !n1.unspaced) return true;
    if (connects(info, n1, n2)) return true;
    return info.digit && n1.percentLike;
  };

  return { joinedBefore, joinedAfter };
}

/**
 * Prepare a source once and look up many quotes in it.
 */
export function createMatcher(source, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const haystack = normalize(source, opts);
  const { findFolded } = preparedMatcher(source, opts, haystack);
  const find = (quote) => findFolded(normalize(quote, opts).text);
  return { find, verify: (quote) => find(quote) !== null };
}

// Diagnostics use the same search with their already folded inputs.
function preparedMatcher(source, opts, haystack) {
  const toSpan = (a, b) => ({ start: haystack.starts[a], end: haystack.ends[b - 1] });

  const { joinedBefore, joinedAfter } = boundaryContext(source, opts, haystack);

  function findFolded(needle) {
    if (!needle) return null;
    const hasEllipsis = opts.allowEllipsis && ELLIPSIS.test(needle);
    const parts = opts.allowEllipsis ? needle.split(ELLIPSIS).filter(Boolean) : [needle];
    if (parts.length === 0) return null;
    if (hasEllipsis && parts.some((part) => part.length < opts.minPart)) return null;
    // A match (and every part of one) must cover whole grapheme clusters, never a slice
    // of a cluster that folded to several characters; and unless boundary is "none",
    // it must satisfy the documented joining rules at each part edge.
    const isAligned = (i, a, b) =>
      haystack.clusterStarts[a] === true &&
      haystack.clusterEnds[b] === true &&
      (opts.boundary === "none" ||
        (!joinedBefore(a) && !joinedAfter(b - 1)));
    const spans = locate(haystack.text, parts, opts.maxGap, isAligned, hasEllipsis);
    if (!spans) return null;
    const { start } = toSpan(...spans[0]);
    const { end } = toSpan(...spans[spans.length - 1]);
    return { start, end, text: source.slice(start, end), parts: spans.map(([a, b]) => toSpan(a, b)) };
  }

  return { findFolded, joinedBefore, joinedAfter };
}

/** Where the quote appears in the source, or null. */
export function findQuote(quote, source, options = {}) {
  return createMatcher(source, options).find(quote);
}

/** True when the quote appears in the source. */
export function verifyQuote(quote, source, options = {}) {
  return findQuote(quote, source, options) !== null;
}

/**
 * Check many quotes against one source. Items are strings or objects with a `quote` field;
 * objects are passed through with a `match` field added.
 */
export function checkQuotes(items, source, options = {}) {
  const matcher = createMatcher(source, options);
  const results = items.map((item) => {
    const quote = typeof item === "string" ? item : item?.quote;
    const match = typeof quote === "string" ? matcher.find(quote) : null;
    return typeof item === "string" ? { quote: item, match } : { ...item, match };
  });
  const found = results.filter((result) => result.match !== null).length;
  return { results, found, missing: results.length - found };
}

// ---- explaining a miss ------------------------------------------------------

// A diagnostic never turns a miss into a match; the search below is bounded by this product
// of the folded lengths: over it, explainMiss answers "limit" instead of searching only a
// part of the source.
const EXPLAIN_PRODUCT_LIMIT = 50000000;

// With no exact substring, Sellers needs only integer costs and no passage-start tracking.
// The product guard bounds these unit costs well below the Uint32 range.
function unrestrictedCosts(Q, S) {
  const codes = Uint32Array.from(S, (char) => char.codePointAt(0));
  let previous = new Uint32Array(S.length + 1);
  let current = new Uint32Array(S.length + 1);
  for (let i = 1; i <= Q.length; i += 1) {
    current[0] = i;
    const q = Q[i - 1].codePointAt(0);
    for (let j = 1; j <= S.length; j += 1) {
      const diagonal = previous[j - 1] + (q === codes[j - 1] ? 0 : 1);
      const deletion = previous[j] + 1;
      const insertion = current[j - 1] + 1;
      current[j] = Math.min(diagonal, deletion, insertion);
    }
    [previous, current] = [current, previous];
  }
  return previous;
}

/**
 * When a quote is missing, say what is different: the closest passage of the source and the
 * differences, seen from the quote. Null when the quote is found or empty.
 */
export function explainMiss(quote, source, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const needle = normalize(quote, opts);
  if (needle.text.length === 0) return null;
  const haystack = normalize(source, opts);
  const { findFolded, joinedBefore, joinedAfter } = preparedMatcher(source, opts, haystack);
  if (findFolded(needle.text) !== null) return null;
  const Q = [...needle.text];
  const S = [...haystack.text];
  if (Q.length * S.length > EXPLAIN_PRODUCT_LIMIT) return { status: "limit" };
  // A missing quote below five code points has a zero close-distance threshold.
  if (Q.length < 5 || S.length === 0) return { status: "far" };

  const unitOf = [0];
  for (const char of S) unitOf.push(unitOf[unitOf.length - 1] + char.length);
  const hasExact = haystack.text.includes(needle.text);
  // Adjacent ASCII word characters always join. Avoid classifying their graphemes again;
  // punctuation, Unicode and original-source gaps still use the complete boundary rules.
  const asciiWord = (at) => {
    const cp = source.charCodeAt(at);
    return cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp >= 48 && cp <= 57 || cp === 95;
  };
  const asciiJoined = (unit) => haystack.clusterStarts[unit - 1] === true &&
    haystack.clusterEnds[unit] === true && haystack.clusterStarts[unit] === true &&
    haystack.clusterEnds[unit + 1] === true &&
    haystack.ends[unit - 1] === haystack.starts[unit - 1] + 1 &&
    haystack.ends[unit] === haystack.starts[unit] + 1 &&
    haystack.ends[unit - 1] === haystack.starts[unit] &&
    asciiWord(haystack.starts[unit - 1]) && asciiWord(haystack.starts[unit]);
  const startAllowed = hasExact ? unitOf.map((unit, j) => j === S.length ||
    (haystack.clusterStarts[unit] === true && (opts.boundary === "none" ||
      (!asciiJoined(unit) && !joinedBefore(unit))))) : null;
  const endAllowed = hasExact ? unitOf.map((unit, j) => j === 0 ||
    (haystack.clusterEnds[unit] === true && (opts.boundary === "none" ||
      (!asciiJoined(unit) && !joinedAfter(unit - 1))))) : null;

  // Exact substrings rejected by the rules are fallback explanations. Prefer a different
  // close passage if one exists, rather than allowing the rejected substring to hide it.
  const exactStartAtEnd = hasExact ? new Array(S.length + 1).fill(-1) : null;
  if (hasExact) {
    for (let at = haystack.text.indexOf(needle.text); at >= 0; at = haystack.text.indexOf(needle.text, at + 1)) {
      let lo = 0;
      let hi = S.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (unitOf[mid] < at) lo = mid + 1;
        else hi = mid;
      }
      if (unitOf[lo] === at) exactStartAtEnd[lo + Q.length] = lo;
    }
    for (let j = 1; j <= S.length; j += 1) {
      exactStartAtEnd[j] = Math.max(exactStartAtEnd[j], exactStartAtEnd[j - 1]);
    }
  }

  // Semi-global edit distance with free starts only at permitted passage edges. Keep two
  // cost rows and their start positions; this preserves the product and distance limits.
  let previous = hasExact ? new Array(S.length + 1).fill(0) : unrestrictedCosts(Q, S);
  let current = hasExact ? new Array(S.length + 1).fill(0) : null;
  let previousStart = hasExact ? new Array(S.length + 1) : null;
  if (hasExact) {
    for (let j = 0; j <= S.length; j += 1) {
      previous[j] = startAllowed[j] ? 0 : j === 0 ? Infinity : previous[j - 1] + 1;
      previousStart[j] = startAllowed[j] ? j : previousStart[j - 1];
    }
  }
  let currentStart = hasExact ? new Array(S.length + 1).fill(0) : null;
  if (hasExact) for (let i = 1; i <= Q.length; i += 1) {
    current[0] = i;
    currentStart[0] = 0;
    const q = Q[i - 1];
    for (let j = 1; j <= S.length; j += 1) {
      const diagonal = previous[j - 1] + (q === S[j - 1] ? 0 : 1);
      const deletion = previous[j] + 1;
      const insertion = current[j - 1] + 1;
      current[j] = Math.min(diagonal, deletion, insertion);
      currentStart[j] = diagonal === current[j] ? previousStart[j - 1]
        : insertion === current[j] ? currentStart[j - 1] : previousStart[j];
    }
    [previous, current] = [current, previous];
    [previousStart, currentStart] = [currentStart, previousStart];
  }
  const threshold = Math.min(16, Math.floor(Q.length * 0.2));
  let best = null;
  let fallback = null;
  for (let j = 1; j <= S.length; j += 1) {
    if ((hasExact && !endAllowed[j]) || previous[j] === 0 || previous[j] > threshold) continue;
    const candidate = { distance: previous[j], end: j };
    if (hasExact && previousStart[j] <= exactStartAtEnd[j]) {
      if (!fallback || candidate.distance < fallback.distance) fallback = candidate;
    } else if (!best || candidate.distance < best.distance) best = candidate;
  }
  const chosen = best && (!fallback || best.distance <= fallback.distance) ? best : fallback ?? best;
  if (!chosen) return { status: "far" };
  const { distance, end } = chosen;

  // Align once more with a full table, inside the window that ends at that position and is
  // quoteLength + distance long, then trace back preferring a match or substitution, then a
  // source character the quote lacks, then a quote character the source lacks.
  const from = Math.max(0, end - (Q.length + distance));
  const W = S.slice(from, end);
  const D = Array.from({ length: Q.length + 1 }, () => new Array(W.length + 1).fill(Infinity));
  for (let j = 0; j <= W.length; j += 1) {
    D[0][j] = !hasExact || startAllowed[from + j] ? 0 : j === 0 ? Infinity : D[0][j - 1] + 1;
  }
  for (let i = 1; i <= Q.length; i += 1) {
    D[i][0] = !hasExact || startAllowed[from] ? i : Infinity;
    for (let j = 1; j <= W.length; j += 1) {
      D[i][j] = Math.min(
        D[i - 1][j - 1] + (Q[i - 1] === W[j - 1] ? 0 : 1),
        D[i - 1][j] + 1,
        D[i][j - 1] + 1,
      );
    }
  }
  const windowEnd = W.length;

  const steps = [];
  for (let i = Q.length, j = windowEnd; i > 0 || D[0][j] > 0; ) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (Q[i - 1] === W[j - 1] ? 0 : 1)) {
      steps.push({ kind: Q[i - 1] === W[j - 1] ? "equal" : "sub", q: Q[i - 1], s: W[j - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && D[i][j] === D[i][j - 1] + 1) {
      steps.push({ kind: "ins", q: "", s: W[j - 1] });
      j -= 1;
    } else {
      steps.push({ kind: "del", q: Q[i - 1], s: "" });
      i -= 1;
    }
  }
  steps.reverse();
  const windowStart = windowEnd - steps.reduce((n, step) => n + (step.s ? 1 : 0), 0);

  const s0 = from + windowStart;
  const s1 = from + windowEnd;

  // Group neighbouring edits, widen each group to whole words and numbers on both sides,
  // merge groups that touch, trim whitespace, and classify by which side is empty. The
  // steps walk the window, so source positions start at the alignment's start in S.
  const edits = [];
  let qPos = 0;
  let sPos = from + windowStart;
  const quoteAtSource = new Map([[sPos, 0]]);
  let open = null;
  for (const step of steps) {
    if (step.kind === "equal") {
      if (open) {
        edits.push(open);
        open = null;
      }
      qPos += 1;
      sPos += 1;
    } else {
      if (!open) open = { q0: qPos, q1: qPos, s0: sPos, s1: sPos };
      if (step.kind === "sub") {
        qPos += 1;
        sPos += 1;
        open.q1 = qPos;
        open.s1 = sPos;
      } else if (step.kind === "ins") {
        sPos += 1;
        open.s1 = sPos;
      } else {
        qPos += 1;
        open.q1 = qPos;
      }
    }
    quoteAtSource.set(sPos, qPos);
  }
  if (open) edits.push(open);

  const isWordChar = (ch) => ch !== undefined && WORD_CHAR.test(ch);
  for (const edit of edits) {
    // Widen source joins first, including punctuation inside a number. Carry the aligned
    // quote positions along: an extra digit in 180 changes 18, rather than dropping 180.
    if (hasExact && edit.s0 < edit.s1) {
      const oldStart = edit.s0;
      const oldEnd = edit.s1;
      while (edit.s0 > s0 && joinedBefore(unitOf[edit.s0])) edit.s0 -= 1;
      while (edit.s1 < s1 && joinedAfter(unitOf[edit.s1] - 1)) edit.s1 += 1;
      if (edit.s0 < oldStart) edit.q0 = Math.min(edit.q0, quoteAtSource.get(edit.s0) ?? edit.q0);
      if (edit.s1 > oldEnd) edit.q1 = Math.max(edit.q1, quoteAtSource.get(edit.s1) ?? edit.q1);
    }
    if (edit.q0 < edit.q1) {
      if (isWordChar(Q[edit.q0])) while (edit.q0 > 0 && isWordChar(Q[edit.q0 - 1])) edit.q0 -= 1;
      if (isWordChar(Q[edit.q1 - 1])) {
        while (edit.q1 < Q.length && isWordChar(Q[edit.q1])) edit.q1 += 1;
      }
    }
    if (edit.s0 < edit.s1) {
      if (isWordChar(S[edit.s0])) while (edit.s0 > 0 && isWordChar(S[edit.s0 - 1])) edit.s0 -= 1;
      if (isWordChar(S[edit.s1 - 1])) {
        while (edit.s1 < S.length && isWordChar(S[edit.s1])) edit.s1 += 1;
      }
    }
  }
  const merged = [];
  for (const edit of edits) {
    const last = merged[merged.length - 1];
    if (last && (edit.q0 <= last.q1 || edit.s0 <= last.s1)) {
      last.q0 = Math.min(last.q0, edit.q0);
      last.q1 = Math.max(last.q1, edit.q1);
      last.s0 = Math.min(last.s0, edit.s0);
      last.s1 = Math.max(last.s1, edit.s1);
    } else {
      merged.push({ ...edit });
    }
  }

  const differences = [];
  for (const group of merged) {
    const quoteSide = Q.slice(group.q0, group.q1).join("").replace(/^\s+|\s+$/g, "");
    let start;
    let end;
    let sourceSide;
    if (group.s1 > group.s0) {
      start = haystack.starts[unitOf[group.s0]];
      end = haystack.ends[unitOf[group.s1] - 1];
      while (start < end && /\s/.test(source[start])) start += 1;
      while (end > start && /\s/.test(source[end - 1])) end -= 1;
      sourceSide = source.slice(start, end);
    } else {
      start = group.s0 < S.length ? haystack.starts[unitOf[group.s0]] : haystack.ends[unitOf[S.length] - 1] ?? 0;
      end = start;
      sourceSide = "";
    }
    if (!quoteSide && !sourceSide) continue;
    differences.push({ kind: sourceSide ? (quoteSide ? "changed" : "dropped") : "added", quote: quoteSide, source: sourceSide, start, end });
  }

  return {
    status: "close",
    nearest: {
      start: haystack.starts[unitOf[s0]],
      end: haystack.ends[unitOf[s1] - 1],
      text: source.slice(haystack.starts[unitOf[s0]], haystack.ends[unitOf[s1] - 1]),
    },
    distance,
    differences: differences.slice(0, 10),
  };
}

// ---- sentences ------------------------------------------------------------

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "e.g", "i.e", "cf", "no", "nos", "fig", "vol",
  "approx", "u.s", "u.k", "u.n",
]);
const LATIN_END = /[.!?…]+["'”’)\]]*(?=\s+["'“‘(\[\p{Lu}\p{N}\p{Lo}])/gu;
const CJK_END = /[。！？]+["'”’」』）)]*/gu;

function isAbbreviation(text, dotIndex) {
  const word = /(\S+)$/.exec(text.slice(0, dotIndex))?.[1] ?? "";
  const bare = word.replace(/^["'“‘(\[]+/, "");
  return ABBREVIATIONS.has(bare.toLowerCase()) || /^\p{Lu}$/u.test(bare);
}

/**
 * Split a text into sentences with their offsets. `text` is always `source.slice(start, end)`.
 *
 * lines: "split" (default) ends a sentence at every line break, which suits text taken from
 * web pages; "paragraph" only at blank lines, which suits hard-wrapped text.
 */
export function splitSentences(source, options = {}) {
  const lines = options.lines ?? "split";
  const cuts = new Set();
  for (const match of source.matchAll(LATIN_END)) {
    const punctuation = match[0];
    if (punctuation.startsWith(".") && /^\.["'”’)\]]*$/.test(punctuation) && isAbbreviation(source, match.index)) {
      continue;
    }
    cuts.add(match.index + punctuation.length);
  }
  for (const match of source.matchAll(CJK_END)) cuts.add(match.index + match[0].length);
  const breaks = lines === "paragraph" ? /\n[^\S\n]*\n/g : /\n/g;
  for (const match of source.matchAll(breaks)) {
    cuts.add(match.index);
    cuts.add(match.index + match[0].length);
  }
  cuts.add(source.length);
  const sentences = [];
  let from = 0;
  for (const cut of [...cuts].sort((a, b) => a - b)) {
    let start = from;
    let end = cut;
    while (start < end && SPACE.test(source[start])) start += 1;
    while (end > start && SPACE.test(source[end - 1])) end -= 1;
    if (end > start) sentences.push({ text: source.slice(start, end), start, end });
    from = cut;
  }
  return sentences;
}

/** The sentence that contains the character at `index`, or null. */
export function sentenceAt(source, index, options = {}) {
  return splitSentences(source, options).find((sentence) => sentence.start <= index && index < sentence.end) ?? null;
}
