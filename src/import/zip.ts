import { ImportError } from './limits';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Read the central directory of a zip file. Bounds-checked: a damaged or hostile archive throws ImportError. */
export function listZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bad = () => new ImportError('This .mxl file is damaged or not a zip archive.');
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw bad();
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CENTRAL) throw bad();
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    if (p + 46 + nameLen > bytes.length) throw bad();
    entries.push({
      name: dec.decode(bytes.subarray(p + 46, p + 46 + nameLen)),
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      uncompressedSize: view.getUint32(p + 24, true),
      localOffset: view.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Inflate one entry. The declared size is checked first, and the real output is counted as it
 * streams, so an archive that lies about its size still cannot grow past `maxBytes`.
 */
export async function readEntry(bytes: Uint8Array, entry: ZipEntry, maxBytes: number): Promise<Uint8Array> {
  const tooBig = () => new ImportError('This file expands to more than the import limit allows, so it was not opened.');
  if (entry.uncompressedSize > maxBytes) throw tooBig();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const o = entry.localOffset;
  if (o + 30 > bytes.length || view.getUint32(o, true) !== LOCAL) throw new ImportError('This .mxl file is damaged.');
  const start = o + 30 + view.getUint16(o + 26, true) + view.getUint16(o + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (data.length !== entry.compressedSize) throw new ImportError('This .mxl file is damaged.');
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new ImportError('This .mxl file uses a compression method Keyfall does not support.');
  if (typeof DecompressionStream === 'undefined') throw new ImportError('This browser cannot open .mxl files. Export the score as .musicxml instead.');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooBig();
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('This .mxl file is damaged.');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
