# Keyfall setup status

Never write secret values here.

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 1a | Apple command line tools | done | /Library/Developer/CommandLineTools |
| 1b | Homebrew | done | 7.0.7 |
| 1c | Node 22+ | done | v25.8.2 at /opt/homebrew/bin/node |
| 1d | git | done | 2.39.5 (Apple Git-154) |
| 1e | Chrome | done | 154.0.8037.99 |
| 1f | GitHub CLI | done | 2.88.1; already logged in as Bh0ss (scopes gist, read:org, repo, workflow) |
| 1g | Supabase CLI | done | 2.120.0 at /opt/homebrew/bin/supabase |
| 2a | gh auth login | done | already authenticated as Bh0ss (repo, workflow scopes) |
| 2b | git init, .gitignore | done | main branch; ignores .env*, node_modules/, the two reference files |
| 2c | Public repo Bh0ss/keyfall, default branch main | done | https://github.com/Bh0ss/keyfall; default branch main, set by the first push |
| 2d | GitHub Pages from Actions | done | build_type workflow; https://bh0ss.github.io/keyfall/ |
| 2e | Secret guardrails | done | gitleaks 8.30.1 pre-commit hook (local, blocks staged secrets); GitHub secret scanning + push protection on; working tree scan clean |
| 3a | Supabase project created | done | project "KeyFall", ref ubheylmkufyuamrgaqev, org Bh0ss (free), region ca-central-1; Data API on, auto-expose new tables OFF (migrations must GRANT table privileges to authenticated explicitly), automatic RLS on |
| 3b | supabase login + link | done | CLI logged in (personal account); supabase init + linked to ubheylmkufyuamrgaqev; remote DB connection verified |
| 3c | .env.local (URL, anon key, DB password) | done | .env.local (chmod 600, gitignored): URL, anon key, project ref, DB password (verified, rotated once) |
| 3d | GitHub repo variables (URL, anon key) | done | repo variables VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY |
| 3e | Supabase MCP (read-only) | partial | local scope for this folder (not in repo); project_ref ubheylmkufyuamrgaqev, read_only=true; OAuth pending: run /mcp › supabase › Authenticate in a Claude session started in this folder |
| 4a | Email + password auth on, confirmation off | done | verified: email on, signups open, email confirmation off |
| 4b | Redirect URLs (localhost:5173, Pages URL) | done | site URL https://bh0ss.github.io/keyfall/; redirect URLs localhost:5173 and Pages URL (with /** variants); verified via Management API |
| 4c | Household account | done | <household email>, confirmed; password held by Captain only |
| 4d | Two test accounts, .env.test.local | done | <test account 1> and <test account 2> created and sign-in verified; credentials in .env.test.local (chmod 600, gitignored) |
| 5 | Playwright + Chromium, MIDI permission test | done | 1.63.0; e2e/midi-permission.spec.ts passes (headless Chromium grants Web MIDI only with both midi and midi-sysex granted; ungranted context is denied; requestMIDIAccess resolves to MIDIAccess with the grant) |
| 6 | autoMode.environment trust entries | done | .claude-accounts/personal/settings.json (account user settings; project files are ignored by auto mode per docs); $defaults kept; repo public, Supabase project, Supabase API; may be reset by an archstart reinstall |
| 7a | FP-30X paired in Audio MIDI Setup | done | Bluetooth LE connected; CoreMIDI source "FP-30X MIDI Bluetooth" online |
| 7b | Phase 0 built, keys light up in Chrome | done | all checks green; Captain confirmed real FP-30X keys light up in Chrome |
