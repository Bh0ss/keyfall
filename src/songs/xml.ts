export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Concatenated direct text, trimmed. */
  text: string;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/** Small, forgiving XML reader: enough for MusicXML, no external dependency. */
export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  const text = new Map<XmlElement, string[]>();
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) {
      (text.get(top) ?? text.set(top, []).get(top)!).push(m[1]);
    } else if (m[6] !== undefined) {
      (text.get(top) ?? text.set(top, []).get(top)!).push(decode(m[6]));
    } else if (m[2] !== undefined && m[3] !== undefined) {
      if (m[2] === '/') {
        if (stack.length > 1) stack.pop();
      } else {
        const attrs: Record<string, string> = {};
        let a: RegExpExecArray | null;
        attrRe.lastIndex = 0;
        while ((a = attrRe.exec(m[4] ?? ''))) attrs[a[1]!] = decode(a[2] ?? a[3] ?? '');
        const el: XmlElement = { name: m[3], attrs, children: [], text: '' };
        top.children.push(el);
        if (m[5] !== '/') stack.push(el);
      }
    }
  }
  for (const [el, parts] of text) el.text = parts.join('').trim();
  const first = root.children[0];
  if (!first) throw new Error('Not an XML document');
  return first;
}

export function child(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}

export function childText(el: XmlElement, name: string): string | undefined {
  return child(el, name)?.text;
}

export function descendants(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (c.name === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}
