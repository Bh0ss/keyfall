import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface TestUser {
  email: string;
  password: string;
}

/** Test account credentials from the environment (loaded by playwright.config.ts). Throws, never skips, when missing. */
export function testUser(n: 1 | 2): TestUser {
  const email = process.env[`TEST_USER_${n}_EMAIL`];
  const password = process.env[`TEST_USER_${n}_PASSWORD`];
  if (!email || !password) throw new Error(`TEST_USER_${n}_EMAIL / TEST_USER_${n}_PASSWORD are not set (see .env.test.local).`);
  return { email, password };
}

function endpoint(): { url: string; key: string } {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set (see .env.local).');
  return { url, key };
}

/** A Supabase client with no stored session. */
export function anonClient(): SupabaseClient {
  const { url, key } = endpoint();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A client signed in as a test account through the real API. */
export async function signedInClient(user: TestUser): Promise<{ sb: SupabaseClient; uid: string }> {
  const sb = anonClient();
  const { data, error } = await sb.auth.signInWithPassword(user);
  if (error || !data.user) throw new Error(`Test account sign-in failed: ${error?.message ?? 'no user'}`);
  return { sb, uid: data.user.id };
}

export const SYNC_TABLES = ['profiles', 'scores', 'attempts', 'learn_progress', 'note_stats', 'review_queue', 'imported_songs'] as const;
