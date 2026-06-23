// ---------------------------------------------------------------------------
// Tracked Changes Engine — OOXML w:ins / w:del markup
// ---------------------------------------------------------------------------
// Written from scratch against the ECMA-376 / ISO 29500 OOXML specification.
// Takes a .docx buffer, applies find/replace edits as Word tracked changes,
// and returns the modified .docx buffer.
// ---------------------------------------------------------------------------

import JSZip from "jszip";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EditInput {
  /** Exact text to find and replace */
  find: string;
  /** Replacement text (empty string = deletion) */
  replace: string;
  /** ~40 chars before `find` for disambiguation */
  context_before: string;
  /** ~40 chars after `find` for disambiguation */
  context_after: string;
  /** Explanation for the edit */
  reason?: string;
}

export interface EditChange {
  /** Unique change identifier */
  id: string;
  deletedText: string;
  insertedText: string;
  contextBefore: string;
  contextAfter: string;
  reason?: string;
}

export interface EditResult {
  /** The modified .docx file */
  bytes: Uint8Array;
  /** Successfully applied changes */
  changes: EditChange[];
  /** Failed edits */
  errors: { index: number; reason: string }[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/**
 * Maps a character range in the flat document text back to the source XML
 * nodes so we can surgically splice tracked-change markup.
 */
interface TextSpan {
  /** Index into the flat text string (inclusive) */
  start: number;
  /** Index into the flat text string (exclusive) */
  end: number;
  /** The text content of this span */
  text: string;
  /** Reference to the <w:p> node in the parsed tree */
  paragraphNode: any;
  /** Reference to the <w:r> node in the parsed tree */
  runNode: any;
  /** Reference to the <w:t> node (or the element containing #text) */
  tNode: any;
  /** Cloned run properties (<w:rPr>) for style inheritance, or null */
  runProps: any | null;
  /** Index of runNode within paragraphNode's children */
  runIndex: number;
}

/** A resolved match: which edit, where in the text, which spans it covers. */
interface ResolvedEdit {
  editIndex: number;
  edit: EditInput;
  /** Start index in flat text (inclusive) */
  matchStart: number;
  /** End index in flat text (exclusive) */
  matchEnd: number;
}

// ---------------------------------------------------------------------------
// XML parser / builder configuration
// ---------------------------------------------------------------------------

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  cdataPropName: "__cdata",
  trimValues: false,
  parseTagValue: false,
  processEntities: false,
  // Keep XML declarations
  ignoreDeclaration: false,
  ignorePiTags: false,
} as const;

const BUILDER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  cdataPropName: "__cdata",
  processEntities: false,
  suppressEmptyNode: false,
  format: false,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep clone a plain object / array structure (no prototypes, no circular refs). */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(deepClone) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    out[key] = deepClone((obj as Record<string, unknown>)[key]);
  }
  return out as T;
}

/** Normalise whitespace for fuzzy context matching (collapse runs of space). */
function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Find the highest `w:id` already used anywhere in the XML so that we can
 * allocate IDs above it for our tracked changes.
 */
function findMaxWId(node: any): number {
  let max = 0;
  if (node == null) return max;

  if (Array.isArray(node)) {
    for (const child of node) {
      max = Math.max(max, findMaxWId(child));
    }
    return max;
  }

  if (typeof node === "object") {
    for (const key of Object.keys(node)) {
      if (key === ":@") {
        // Attributes object — look for @_w:id
        const attrs = node[key];
        if (attrs && typeof attrs === "object") {
          const id = attrs["@_w:id"];
          if (id != null) {
            const n = parseInt(String(id), 10);
            if (!isNaN(n)) max = Math.max(max, n);
          }
        }
      } else {
        max = Math.max(max, findMaxWId(node[key]));
      }
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Text map construction
// ---------------------------------------------------------------------------

/**
 * Walk the parsed XML tree (preserveOrder format) and build a flat text
 * string plus a mapping from character offsets back to XML nodes.
 *
 * preserveOrder format: each node is `{ tagName: [...children], ":@": {attrs} }`
 */
function buildTextMap(parsedXml: any[]): { flatText: string; spans: TextSpan[] } {
  const spans: TextSpan[] = [];
  let offset = 0;

  function walkArray(nodes: any[], parentParagraph?: any): void {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      walkNode(node, parentParagraph);
    }
  }

  function walkNode(node: any, parentParagraph?: any): void {
    if (node == null || typeof node !== "object") return;

    // Check if this node is a <w:p>
    if ("w:p" in node) {
      const pChildren = node["w:p"];
      if (Array.isArray(pChildren)) {
        walkArray(pChildren, node);
      }
      return;
    }

    // Check if this node is a <w:r> inside a paragraph
    if ("w:r" in node && parentParagraph) {
      const rChildren = node["w:r"];
      if (Array.isArray(rChildren)) {
        // Extract run properties
        let runProps: any = null;
        for (const rc of rChildren) {
          if (rc && typeof rc === "object" && "w:rPr" in rc) {
            runProps = deepClone(rc);
            break;
          }
        }

        // Find <w:t> nodes
        for (const rc of rChildren) {
          if (rc && typeof rc === "object" && "w:t" in rc) {
            const tContent = rc["w:t"];
            let text = "";
            if (Array.isArray(tContent)) {
              // In preserveOrder, the text is in a child with #text key
              for (const tc of tContent) {
                if (tc && typeof tc === "object" && "#text" in tc) {
                  text += String(tc["#text"]);
                }
              }
            } else if (typeof tContent === "string") {
              text = tContent;
            }

            if (text.length > 0) {
              // Find run index within paragraph
              const pChildren = parentParagraph["w:p"];
              const runIndex = Array.isArray(pChildren)
                ? pChildren.indexOf(node)
                : -1;

              spans.push({
                start: offset,
                end: offset + text.length,
                text,
                paragraphNode: parentParagraph,
                runNode: node,
                tNode: rc,
                runProps,
                runIndex,
              });
              offset += text.length;
            }
          }
        }
      }
      return;
    }

    // Recurse into any other element's children
    for (const key of Object.keys(node)) {
      if (key === ":@") continue; // skip attributes
      const val = node[key];
      if (Array.isArray(val)) {
        walkArray(val, parentParagraph);
      }
    }
  }

  walkArray(parsedXml);

  const flatText = spans.map((s) => s.text).join("");
  return { flatText, spans };
}

// ---------------------------------------------------------------------------
// Edit matching
// ---------------------------------------------------------------------------

/**
 * Locate each edit's `find` text in the flat document text, using context
 * for disambiguation.
 */
function matchEdits(
  flatText: string,
  edits: EditInput[],
): { resolved: ResolvedEdit[]; errors: { index: number; reason: string }[] } {
  const resolved: ResolvedEdit[] = [];
  const errors: { index: number; reason: string }[] = [];
  // Track positions already claimed by earlier edits to avoid overlapping
  const claimed = new Set<string>();

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];

    // Pure insertion with context: insert at the position right after context_before
    if (!edit.find && edit.replace) {
      // For pure insertion, we locate the insertion point by context
      const contextBefore = edit.context_before || "";
      const contextAfter = edit.context_after || "";
      if (!contextBefore && !contextAfter) {
        errors.push({ index: i, reason: "Pure insertion requires context_before or context_after to locate insertion point" });
        continue;
      }
      // Find the context pattern
      const pattern = contextBefore + contextAfter;
      const candidates = findAllOccurrences(flatText, pattern, false);
      if (candidates.length === 0) {
        errors.push({ index: i, reason: `Could not locate insertion point with given context` });
        continue;
      }
      // Use the insertion point right after context_before
      const pos = candidates[0] + contextBefore.length;
      resolved.push({
        editIndex: i,
        edit,
        matchStart: pos,
        matchEnd: pos, // zero-length match for insertion
      });
      continue;
    }

    if (!edit.find) {
      errors.push({ index: i, reason: "Edit has empty 'find' and empty 'replace' — nothing to do" });
      continue;
    }

    // Build the full search pattern with context
    const ctxBefore = edit.context_before || "";
    const ctxAfter = edit.context_after || "";

    if (ctxBefore || ctxAfter) {
      // Strategy: search for the full pattern (context_before + find + context_after)
      // with normalised/fuzzy matching on context but exact on `find`
      const result = findWithContext(flatText, edit.find, ctxBefore, ctxAfter, claimed);
      if (result === null) {
        errors.push({
          index: i,
          reason: `Could not find text "${truncate(edit.find, 60)}" with the given context`,
        });
      } else {
        const key = `${result.start}:${result.end}`;
        claimed.add(key);
        resolved.push({
          editIndex: i,
          edit,
          matchStart: result.start,
          matchEnd: result.end,
        });
      }
    } else {
      // No context — exact search for `find`
      const candidates = findAllOccurrences(flatText, edit.find, true);
      // Filter out already claimed
      const available = candidates.filter((pos) => {
        const key = `${pos}:${pos + edit.find.length}`;
        return !claimed.has(key);
      });
      if (available.length === 0) {
        errors.push({
          index: i,
          reason: `Could not find text "${truncate(edit.find, 60)}" in document`,
        });
      } else {
        if (available.length > 1) {
          errors.push({
            index: i,
            reason: `Found ${available.length} occurrences of "${truncate(edit.find, 40)}" — provide context_before/context_after to disambiguate`,
          });
        } else {
          const pos = available[0];
          const key = `${pos}:${pos + edit.find.length}`;
          claimed.add(key);
          resolved.push({
            editIndex: i,
            edit,
            matchStart: pos,
            matchEnd: pos + edit.find.length,
          });
        }
      }
    }
  }

  return { resolved, errors };
}

/** Find all exact occurrences of `needle` in `haystack`. */
function findAllOccurrences(haystack: string, needle: string, exact: boolean): number[] {
  const results: number[] = [];
  if (!needle) return results;
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = exact
      ? haystack.indexOf(needle, pos)
      : haystack.toLowerCase().indexOf(needle.toLowerCase(), pos);
    if (idx === -1) break;
    results.push(idx);
    pos = idx + 1;
  }
  return results;
}

/**
 * Find `find` text using surrounding context for disambiguation.
 * Context matching is case-insensitive with whitespace normalisation;
 * `find` matching is exact.
 */
function findWithContext(
  flatText: string,
  find: string,
  ctxBefore: string,
  ctxAfter: string,
  claimed: Set<string>,
): { start: number; end: number } | null {
  // Find all exact occurrences of `find`
  const candidates = findAllOccurrences(flatText, find, true);
  if (candidates.length === 0) return null;

  // Score each candidate by how well the surrounding text matches the context
  let bestScore = -1;
  let bestPos = -1;

  const normCtxBefore = normalise(ctxBefore);
  const normCtxAfter = normalise(ctxAfter);

  for (const pos of candidates) {
    const key = `${pos}:${pos + find.length}`;
    if (claimed.has(key)) continue;

    let score = 0;

    if (normCtxBefore) {
      // Extract text before the match
      const beforeStart = Math.max(0, pos - ctxBefore.length - 20);
      const textBefore = flatText.slice(beforeStart, pos);
      const normBefore = normalise(textBefore);
      // Check if context appears at the end of the text before
      if (normBefore.endsWith(normCtxBefore)) {
        score += 2;
      } else if (normBefore.includes(normCtxBefore)) {
        score += 1;
      }
    }

    if (normCtxAfter) {
      // Extract text after the match
      const afterEnd = Math.min(flatText.length, pos + find.length + ctxAfter.length + 20);
      const textAfter = flatText.slice(pos + find.length, afterEnd);
      const normAfter = normalise(textAfter);
      // Check if context appears at the start of the text after
      if (normAfter.startsWith(normCtxAfter)) {
        score += 2;
      } else if (normAfter.includes(normCtxAfter)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }

  // Accept if we found at least some context match, or if there was only one candidate
  if (bestPos >= 0 && (bestScore > 0 || candidates.length === 1)) {
    return { start: bestPos, end: bestPos + find.length };
  }

  // Fallback: if only one unclaimed candidate, use it even without context match
  const unclaimed = candidates.filter(
    (p) => !claimed.has(`${p}:${p + find.length}`),
  );
  if (unclaimed.length === 1) {
    return { start: unclaimed[0], end: unclaimed[0] + find.length };
  }

  return null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

// ---------------------------------------------------------------------------
// XML mutation — apply tracked changes
// ---------------------------------------------------------------------------

/**
 * Build an OOXML <w:del> node wrapping the given text with inherited run props.
 */
function makeDelNode(
  text: string,
  rPr: any | null,
  id: number,
  author: string,
  date: string,
): any {
  const delTextNode: any = { "w:delText": [{ "#text": text }] };
  // Preserve whitespace
  delTextNode[":@"] = { "@_xml:space": "preserve" };

  const runChildren: any[] = [];
  if (rPr) {
    runChildren.push(deepClone(rPr));
  }
  runChildren.push(delTextNode);

  const runNode = { "w:r": runChildren };

  return {
    "w:del": [runNode],
    ":@": {
      "@_w:id": String(id),
      "@_w:author": author,
      "@_w:date": date,
    },
  };
}

/**
 * Build an OOXML <w:ins> node wrapping the given text with inherited run props.
 */
function makeInsNode(
  text: string,
  rPr: any | null,
  id: number,
  author: string,
  date: string,
): any {
  const tNode: any = { "w:t": [{ "#text": text }] };
  tNode[":@"] = { "@_xml:space": "preserve" };

  const runChildren: any[] = [];
  if (rPr) {
    runChildren.push(deepClone(rPr));
  }
  runChildren.push(tNode);

  const runNode = { "w:r": runChildren };

  return {
    "w:ins": [runNode],
    ":@": {
      "@_w:id": String(id),
      "@_w:author": author,
      "@_w:date": date,
    },
  };
}

/**
 * Find spans that overlap [matchStart, matchEnd) in the flat text.
 */
function findOverlappingSpans(
  spans: TextSpan[],
  matchStart: number,
  matchEnd: number,
): TextSpan[] {
  return spans.filter((s) => s.start < matchEnd && s.end > matchStart);
}

/**
 * Apply a single resolved edit to the XML tree, splicing out the matched
 * run(s) and inserting w:del / w:ins nodes.
 *
 * Returns the new nodes count delta for ID allocation.
 */
function applySingleEdit(
  resolved: ResolvedEdit,
  spans: TextSpan[],
  nextId: { value: number },
  author: string,
  date: string,
): void {
  const { matchStart, matchEnd, edit } = resolved;
  const overlapping = findOverlappingSpans(spans, matchStart, matchEnd);

  if (overlapping.length === 0) return;

  // Collect the deleted text and the rPr from the first overlapping span
  const inheritRPr = overlapping[0].runProps;

  // We need to work at the paragraph level. Group overlapping spans by paragraph.
  // (In practice, most edits are within a single paragraph.)
  const byParagraph = new Map<any, TextSpan[]>();
  for (const span of overlapping) {
    const existing = byParagraph.get(span.paragraphNode);
    if (existing) {
      existing.push(span);
    } else {
      byParagraph.set(span.paragraphNode, [span]);
    }
  }

  for (const [pNode, pSpans] of byParagraph) {
    const pChildren: any[] = pNode["w:p"];
    if (!Array.isArray(pChildren)) continue;

    // Process spans in reverse order within this paragraph to avoid index shifts
    const sortedSpans = [...pSpans].sort((a, b) => b.start - a.start);

    for (const span of sortedSpans) {
      const runIdx = pChildren.indexOf(span.runNode);
      if (runIdx === -1) continue;

      // Calculate the overlap between this span and the match
      const overlapStart = Math.max(span.start, matchStart);
      const overlapEnd = Math.min(span.end, matchEnd);

      // Offsets within this span's text
      const localStart = overlapStart - span.start;
      const localEnd = overlapEnd - span.start;

      const beforeText = span.text.slice(0, localStart);
      const deletedText = span.text.slice(localStart, localEnd);
      const afterText = span.text.slice(localEnd);

      // Build replacement nodes to splice in place of this run
      const replacementNodes: any[] = [];

      // 1. Text before the match (keep as normal run)
      if (beforeText) {
        replacementNodes.push(makeTextRun(beforeText, span.runProps, span.runNode));
      }

      // 2. The w:del node for deleted text
      if (deletedText) {
        replacementNodes.push(
          makeDelNode(deletedText, inheritRPr, nextId.value++, author, date),
        );
      }

      // 3. The w:ins node — only on the FIRST span of the match (to avoid
      //    inserting the replacement multiple times when a match spans runs)
      const isFirstSpan = span === overlapping[0];
      if (isFirstSpan && edit.replace) {
        replacementNodes.push(
          makeInsNode(edit.replace, inheritRPr, nextId.value++, author, date),
        );
      }

      // 4. Text after the match (keep as normal run)
      if (afterText) {
        replacementNodes.push(makeTextRun(afterText, span.runProps, span.runNode));
      }

      // Splice into paragraph children
      pChildren.splice(runIdx, 1, ...replacementNodes);
    }
  }
}

/**
 * Create a plain <w:r> node containing text, preserving original run properties.
 */
function makeTextRun(text: string, rPr: any | null, originalRun: any): any {
  const tNode: any = { "w:t": [{ "#text": text }] };
  tNode[":@"] = { "@_xml:space": "preserve" };

  const runChildren: any[] = [];
  if (rPr) {
    runChildren.push(deepClone(rPr));
  }
  runChildren.push(tNode);

  const result: any = { "w:r": runChildren };

  // Copy run-level attributes if any
  if (originalRun[":@"]) {
    result[":@"] = deepClone(originalRun[":@"]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Apply tracked-change edits to a .docx file.
 *
 * @param docxBytes  The source .docx file as a Uint8Array
 * @param edits      Array of find/replace edits to apply
 * @param options    Optional settings (author name)
 * @returns          The modified .docx with tracked changes, plus metadata
 */
export async function applyTrackedEdits(
  docxBytes: Uint8Array,
  edits: EditInput[],
  options?: { author?: string },
): Promise<EditResult> {
  const author = options?.author ?? "AI Legal Assistant";
  const date = new Date().toISOString();
  const changes: EditChange[] = [];
  const errors: { index: number; reason: string }[] = [];

  // 1. Unzip
  const zip = await JSZip.loadAsync(docxBytes);
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    return {
      bytes: docxBytes,
      changes: [],
      errors: [{ index: -1, reason: "word/document.xml not found in .docx archive" }],
    };
  }
  const docXmlStr = await docXmlFile.async("string");

  // 2. Parse
  const parser = new XMLParser(PARSER_OPTIONS);
  const parsed: any[] = parser.parse(docXmlStr);

  // 3. Build text map
  const { flatText, spans } = buildTextMap(parsed);

  if (spans.length === 0) {
    return {
      bytes: docxBytes,
      changes: [],
      errors: [{ index: -1, reason: "No text content found in document" }],
    };
  }

  // 4. Match edits
  const { resolved, errors: matchErrors } = matchEdits(flatText, edits);
  errors.push(...matchErrors);

  if (resolved.length === 0) {
    return { bytes: docxBytes, changes: [], errors };
  }

  // 5. Find max existing w:id to allocate above it
  let maxId = findMaxWId(parsed);
  const nextId = { value: maxId + 1 };

  // 6. Sort resolved edits by position (descending) to apply from end to start
  const sorted = [...resolved].sort((a, b) => b.matchStart - a.matchStart);

  // 7. Apply each edit
  for (const res of sorted) {
    const changeId = String(nextId.value);
    applySingleEdit(res, spans, nextId, author, date);

    // Extract context from flat text for the change record
    const ctxBefore = flatText.slice(
      Math.max(0, res.matchStart - 40),
      res.matchStart,
    );
    const ctxAfter = flatText.slice(
      res.matchEnd,
      Math.min(flatText.length, res.matchEnd + 40),
    );

    changes.push({
      id: changeId,
      deletedText: res.edit.find,
      insertedText: res.edit.replace,
      contextBefore: ctxBefore,
      contextAfter: ctxAfter,
      reason: res.edit.reason,
    });
  }

  // Reverse changes so they are in document order (we applied in reverse)
  changes.reverse();

  // 8. Serialize back to XML
  const builder = new XMLBuilder(BUILDER_OPTIONS);
  const newXml: string = builder.build(parsed);

  // 9. Replace in ZIP and generate output
  zip.file("word/document.xml", newXml);
  const outputBuffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    bytes: outputBuffer,
    changes,
    errors,
  };
}
