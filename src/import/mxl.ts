import { MAX_UNZIPPED_BYTES, ImportError } from './limits';
import { readEntry, listZip } from './zip';
import { descendants, parseXml } from '../songs/xml';

/** Extract the score document from a compressed MusicXML (.mxl) archive. */
export async function unpackMxl(bytes: Uint8Array): Promise<string> {
  const entries = listZip(bytes);
  const declared = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  if (declared > MAX_UNZIPPED_BYTES) throw new ImportError('This file expands to more than the import limit allows, so it was not opened.');
  const dec = new TextDecoder();
  const byName = new Map(entries.map((e) => [e.name, e]));

  let path: string | undefined;
  const container = byName.get('META-INF/container.xml');
  if (container) {
    const xml = dec.decode(await readEntry(bytes, container, MAX_UNZIPPED_BYTES));
    const rootfile = descendants(parseXml(xml), 'rootfile')[0];
    path = rootfile?.attrs['full-path'];
  }
  const entry =
    (path ? byName.get(path) : undefined) ??
    entries.find((e) => /\.(musicxml|xml)$/i.test(e.name) && !e.name.startsWith('META-INF/') && !e.name.endsWith('/'));
  if (!entry) throw new ImportError('No score was found inside this .mxl file.');
  return dec.decode(await readEntry(bytes, entry, MAX_UNZIPPED_BYTES));
}
