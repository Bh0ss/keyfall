import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FOLK_ARRANGEMENTS, FONTS, LIBRARIES, LICENSED_SONGS, MUTOPIA_PUBLIC_DOMAIN, LICENCE_URL, REPO_URL } from '../src/ui/credits';

const notice = readFileSync(new URL('../src/songs/NOTICE.md', import.meta.url), 'utf8');

describe('credits data stays in step with src/songs/NOTICE.md', () => {
  it('every credited song file is named in NOTICE.md', () => {
    const files = [...LICENSED_SONGS.flatMap((s) => s.files), ...MUTOPIA_PUBLIC_DOMAIN.map((s) => s.file), ...FOLK_ARRANGEMENTS.map((s) => s.file)];
    for (const f of files) expect(notice, f).toContain(f);
  });

  it('the Creative Commons entries carry the licence, licence link, typesetter and Mutopia ids from NOTICE.md', () => {
    for (const s of LICENSED_SONGS) {
      expect(notice, s.licence).toContain(s.licence);
      expect(notice, s.licenceUrl).toContain(s.licenceUrl);
      expect(notice, s.typesetter).toContain(s.typesetter);
      for (const src of s.sources) expect(notice, src.url).toMatch(new RegExp(`id=${src.url.split('id=')[1]}\\b|\\?id=${src.url.split('id=')[1]}\\b`));
    }
  });

  it('named typesetters match NOTICE.md', () => {
    for (const s of MUTOPIA_PUBLIC_DOMAIN) if (s.typesetter) expect(notice, s.typesetter).toContain(s.typesetter);
  });

  it('every CC BY-SA file in NOTICE.md is credited (no licensed file is missing)', () => {
    const licensed = LICENSED_SONGS.flatMap((s) => s.files);
    expect(licensed.sort()).toEqual(['chopin-nocturne-op72-1.musicxml', 'schumann-happy-farmer.musicxml', 'schumann-melody-op68-1.musicxml']);
  });
});

describe('library and font licences match the installed packages', () => {
  const pkg = (name: string) => JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')) as { license: string };
  const byName: Record<string, string> = {
    OpenSheetMusicDisplay: 'opensheetmusicdisplay',
    VexFlow: 'vexflow',
    '@tonejs/midi': '@tonejs/midi',
    Dexie: 'dexie',
    'supabase-js': '@supabase/supabase-js',
    React: 'react',
    'Bricolage Grotesque': '@fontsource/bricolage-grotesque',
    'DM Sans': '@fontsource/dm-sans',
    'JetBrains Mono': '@fontsource/jetbrains-mono',
  };
  it('every listed licence is what the package declares', () => {
    for (const c of [...LIBRARIES, ...FONTS]) expect(pkg(byName[c.name]!).license, c.name).toBe(c.licence);
  });
});

describe('project licence', () => {
  const licence = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  it('is MIT, declared in package.json and linked from the credits data', () => {
    expect(licence).toContain('MIT License');
    expect(licence).toContain('Copyright (c) 2026 Bh0ss');
    expect(pkg.license).toBe('MIT');
    expect(LICENCE_URL).toBe(`${REPO_URL}/blob/main/LICENSE`);
  });

  it('LICENSE and NOTICE.md both say the CC BY-SA song files are not relicensed', () => {
    expect(notice).toContain('MIT');
    for (const s of LICENSED_SONGS) for (const f of s.files) expect(licence, f).toContain(f);
  });
});
