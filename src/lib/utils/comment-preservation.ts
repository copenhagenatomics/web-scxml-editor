import { formatXML } from './format-utils';

/**
 * Re-inserts the XML comments of `originalXml` into `rebuiltXml`.
 *
 * The object-tree edit path (fast-xml-parser parse → mutate → XMLBuilder)
 * cannot carry comments, so every edit made that way used to strip every
 * comment in the document. Rather than teach each edit about comments, the
 * serializer calls this once on its output: each comment is anchored to where
 * it sat in the original — its parent element, and the element right after
 * (or before) it — and put back at the same spot in the rebuilt document.
 *
 * Elements are matched by `id` when they have one (so a comment inside a
 * state follows that state when it's moved or re-tagged, e.g. <parallel> →
 * <state>), otherwise by tag + position among same-tag siblings, relative to
 * the nearest ancestor that has an id. A comment whose parent element no
 * longer exists (it was deleted) is dropped with it.
 *
 * Returns `rebuiltXml` unchanged when there is nothing to restore, when it
 * already contains comments, or when either string can't be parsed.
 */
export function restoreComments(originalXml: string, rebuiltXml: string): string {
  if (!originalXml.includes('<!--') || rebuiltXml.includes('<!--')) return rebuiltXml;
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return rebuiltXml;

  const original = parseDoc(originalXml);
  const rebuilt = parseDoc(rebuiltXml);
  if (!original || !rebuilt) return rebuiltXml;

  const comments = collectComments(original);
  if (comments.length === 0) return rebuiltXml;

  const byId = new Map<string, Element>();
  for (const el of Array.from(rebuilt.getElementsByTagName('*'))) {
    const id = el.getAttribute('id');
    if (id && !byId.has(id)) byId.set(id, el);
  }

  const inserted = new Set<Node>();
  for (const comment of comments) {
    const anchor = describe(comment);
    const parent = resolveParent(rebuilt, anchor.parent, byId);
    if (!parent) continue; // its container was deleted

    const node = rebuilt.createComment(comment.data);
    const next = anchor.next && findChild(parent, anchor.next);
    const prev = anchor.prev && findChild(parent, anchor.prev);

    if (next) {
      parent.insertBefore(node, next);
    } else if (prev) {
      parent.insertBefore(node, skipInserted(prev.nextSibling, inserted));
    } else if (!anchor.prev) {
      // Nothing came before it (often the only thing in its parent, like the
      // template's "Add states…" note): keep it ahead of anything added since.
      parent.insertBefore(node, skipInserted(parent.firstChild, inserted));
    } else {
      parent.appendChild(node);
    }
    inserted.add(node);
  }

  const body = formatXML(new XMLSerializer().serializeToString(rebuilt));
  return withDeclaration(rebuiltXml, body);
}

const DECLARATION = /^\s*(<\?xml[^?]*\?>)/;

/**
 * Puts `source`'s `<?xml …?>` declaration back on `xml` if `xml` lacks one.
 * Neither XMLBuilder (the parsed tree doesn't keep it) nor XMLSerializer
 * writes it.
 */
export function withDeclaration(source: string, xml: string): string {
  const declaration = source.match(DECLARATION)?.[1];
  if (!declaration || DECLARATION.test(xml)) return xml;
  return `${declaration}\n${xml.replace(/^\s+/, '')}`;
}

/** How to find an element again: by id, or by tag + index among same-tag siblings. */
type Key = { id: string } | { tag: string; index: number };

/** Parent: the nearest ancestor-or-self with an id (or the root), then tag/index steps down. */
interface ParentPath {
  isDocument: boolean;
  baseId?: string;
  steps: Key[];
}

interface CommentAnchor {
  parent: ParentPath;
  next?: Key;
  prev?: Key;
}

function parseDoc(xml: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return doc.getElementsByTagName('parsererror').length > 0 ? null : doc;
  } catch {
    return null;
  }
}

function collectComments(doc: Document): Comment[] {
  const out: Comment[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 8) out.push(child as Comment);
      else if (child.nodeType === 1) walk(child);
    }
  };
  walk(doc);
  return out;
}

function keyOf(el: Element): Key {
  const id = el.getAttribute('id');
  if (id) return { id };
  let index = 0;
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) {
    if (s.localName === el.localName) index++;
  }
  return { tag: el.localName, index };
}

function describe(comment: Comment): CommentAnchor {
  const parentNode = comment.parentNode!;
  let parent: ParentPath;
  if (parentNode.nodeType === 9) {
    parent = { isDocument: true, steps: [] };
  } else {
    const steps: Key[] = [];
    let baseId: string | undefined;
    for (let el: Element | null = parentNode as Element; el && el.parentNode?.nodeType !== 9; el = el.parentElement) {
      const key = keyOf(el);
      if ('id' in key) {
        baseId = key.id;
        break;
      }
      steps.unshift(key);
    }
    parent = { isDocument: false, baseId, steps };
  }

  let nextEl: Node | null = comment.nextSibling;
  while (nextEl && nextEl.nodeType !== 1) nextEl = nextEl.nextSibling;
  let prevEl: Node | null = comment.previousSibling;
  while (prevEl && prevEl.nodeType !== 1) prevEl = prevEl.previousSibling;

  return {
    parent,
    next: nextEl ? keyOf(nextEl as Element) : undefined,
    prev: prevEl ? keyOf(prevEl as Element) : undefined,
  };
}

function resolveParent(doc: Document, path: ParentPath, byId: Map<string, Element>): Node | null {
  if (path.isDocument) return doc;
  let el: Element | null = path.baseId ? byId.get(path.baseId) ?? null : doc.documentElement;
  for (const step of path.steps) {
    if (!el) return null;
    el = findChild(el, step);
  }
  return el;
}

function findChild(parent: Node, key: Key): Element | null {
  let index = 0;
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    if ('id' in key) {
      if (el.getAttribute('id') === key.id) return el;
    } else if (el.localName === key.tag) {
      if (index === key.index) return el;
      index++;
    }
  }
  return null;
}

function skipInserted(node: Node | null, inserted: Set<Node>): Node | null {
  while (node && inserted.has(node)) node = node.nextSibling;
  return node;
}
