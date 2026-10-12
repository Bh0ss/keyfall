/** Imported files are untrusted input: these caps bound the work any one file can cause. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Total bytes a .mxl may inflate to (zip-bomb guard). */
export const MAX_UNZIPPED_BYTES = 30 * 1024 * 1024;
export const MAX_NOTES = 60_000;
/** Longest piece accepted, in quarter-note beats (about 2.5 hours at 100 bpm). */
export const MAX_BEATS = 15_000;
export const ACCEPTED_EXTENSIONS = ['.mid', '.midi', '.musicxml', '.xml', '.mxl'] as const;

export type ImportFormat = 'midi' | 'musicxml' | 'mxl';

/** A problem the player can understand, shown as-is on the import screen. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export function formatOf(fileName: string): ImportFormat | null {
  const ext = /\.[^.]+$/.exec(fileName.toLowerCase())?.[0];
  if (ext === '.mid' || ext === '.midi') return 'midi';
  if (ext === '.musicxml' || ext === '.xml') return 'musicxml';
  if (ext === '.mxl') return 'mxl';
  return null;
}
