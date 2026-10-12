import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

/** True when the build was given a Supabase URL and anon key. Without them the app is local-only. */
export function syncConfigured(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

/**
 * The Supabase client, or null when not configured. The anon key is the public (publishable) key;
 * row-level security is what protects the data. Sessions persist in localStorage. Magic links are
 * not used, so the URL hash (our router) is never parsed for a session.
 */
export function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
  return client;
}
