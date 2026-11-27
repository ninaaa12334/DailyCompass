import { readPhoto } from '../../server/photo-import.mjs';

// AI for everyone on the website (not only when the Node server runs on your own computer).
//   POST /ai/photo  → reads a photo of notes and returns the dated items it finds, for review.
// Same code as the Node server's /api/ai/photo. Needs a signed-in Supabase account, and the
// Cloudflare secret GEMINI_API_KEY (free tier) or OPENAI_API_KEY + OPENAI_MODEL.
// Limited per person: one photo every 4 seconds and 40 an hour, because API use can cost money.

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const MAX_BODY = 2_200_000; // a 1.5 MB photo as base64, plus a little room
const HOUR = 3600000, GAP = 4000, PER_HOUR = 40;

async function supabaseUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token.length > 4000) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

const ready = new WeakSet(); // databases that already have the ai_usage table
// Returns false when this person has used the photo reader too often.
export async function allowAiUse(env, userId, kind, now = Date.now()) {
  if (!ready.has(env.DB)) {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_usage (user_id TEXT NOT NULL, kind TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL, last INTEGER NOT NULL, PRIMARY KEY (user_id, kind))').run();
    ready.add(env.DB);
  }
  const row = await env.DB.prepare('SELECT window_start, count, last FROM ai_usage WHERE user_id = ? AND kind = ?').bind(userId, kind).first();
  const fresh = !row || row.window_start + HOUR < now;
  if (!fresh && (now - row.last < GAP || row.count >= PER_HOUR)) return false;
  await env.DB.prepare('INSERT INTO ai_usage (user_id, kind, window_start, count, last) VALUES (?, ?, ?, 1, ?) ON CONFLICT (user_id, kind) DO UPDATE SET window_start = excluded.window_start, count = ?, last = excluded.last')
    .bind(userId, kind, fresh ? now : row.window_start, now, fresh ? 1 : row.count + 1).run();
  return true;
}

export async function handleAi(request, env, path) {
  if (request.method !== 'POST' || path !== '/ai/photo') return json({ error: 'Not found.' }, 404);
  const user = await supabaseUser(request, env);
  if (!user) return json({ error: 'Sign in to read photos with AI.' }, 401);
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'That photo is too large. Try a smaller one.' }, 413);
  let input; try { input = JSON.parse(text || '{}'); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!await allowAiUse(env, user.id, 'photo')) return json({ error: 'Too many photos in a short time. Wait a little and try again.' }, 429);
  const config = { GEMINI_API_KEY: env.GEMINI_API_KEY, GEMINI_MODEL: env.GEMINI_MODEL, OPENAI_API_KEY: env.OPENAI_API_KEY, OPENAI_MODEL: env.OPENAI_MODEL };
  if (!config.GEMINI_API_KEY && !(config.OPENAI_API_KEY && config.OPENAI_MODEL)) return json({ error: 'Reading photos isn’t switched on for the website yet. (Its owner needs to add a GEMINI_API_KEY to the Cloudflare service.)' }, 503);
  try { return json(await readPhoto(input, config)); }
  catch (problem) {
    if (problem.name === 'TimeoutError' || problem.name === 'AbortError') return json({ error: 'The AI took too long to answer. Try again, or crop the photo to just the dates.' }, 504);
    // The Node server's messages mention .env; on the website the key lives in Cloudflare instead.
    return json({ error: String(problem.message || 'Something went wrong.').replace(/ in \.env and restart the server\.?| to the server’s \.env, then restart it\.?/g, '.') }, problem.status || 500);
  }
}
