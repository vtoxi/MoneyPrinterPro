import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { rateLimit } from '@/lib/rate-limit';
import { GENERATED_DIR, ensureDir } from '@/lib/personas';
import { clampString } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const run = promisify(execFile);
const SCRIPT = path.join(process.cwd(), 'tools', 'make_media.py');
const ACCENTS = new Set(['gold', 'emerald', 'red', 'white']);
const SLUG = /^[a-z0-9]{1,30}$/;
const MAX_ITEMS = 10;

function cleanItem(raw, isScene) {
  const title = clampString(raw?.title, 200);
  if (!title) return null;
  const out = { title, sub: clampString(raw.sub, 300) || null };
  if (isScene) out.seconds = Math.min(Math.max(Number(raw.seconds) || 4, 2), 10);
  const kicker = clampString(raw.kicker, 40);
  if (kicker) out.kicker = kicker;
  if (ACCENTS.has(raw.accent)) out.accent = raw.accent;
  const logos = Array.isArray(raw.logos) ? raw.logos.filter((l) => SLUG.test(l)).slice(0, 4) : [];
  if (logos.length) out.logos = logos;
  return out;
}

export async function POST(request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  if (!rateLimit(ip)) return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const type = body?.type;
  if (!['reel', 'carousel', 'story'].includes(type)) {
    return NextResponse.json({ error: 'type must be reel, carousel or story' }, { status: 400 });
  }
  const spec = { type, handle: clampString(body.handle, 40) || undefined };
  if (type === 'reel' || type === 'carousel') {
    const key = type === 'reel' ? 'scenes' : 'slides';
    const items = (Array.isArray(body[key]) ? body[key] : []).slice(0, MAX_ITEMS)
      .map((r) => cleanItem(r, type === 'reel')).filter(Boolean);
    if (!items.length) return NextResponse.json({ error: `Add at least one ${key === 'scenes' ? 'scene' : 'slide'} with a title` }, { status: 400 });
    spec[key] = items;
  } else {
    const item = cleanItem(body, false);
    if (!item) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    Object.assign(spec, item);
  }

  const id = `studio-${Date.now()}`;
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'mpp-studio-'));
  try {
    await ensureDir(GENERATED_DIR);
    const specPath = path.join(work, 'spec.json');
    await fs.writeFile(specPath, JSON.stringify(spec));
    const out = path.join(work, 'out');
    await run(process.env.PYTHON || 'python', [SCRIPT, '--render', specPath, out], { timeout: 540000, windowsHide: true });

    const files = [];
    const move = async (src, name) => {
      await fs.copyFile(src, path.join(GENERATED_DIR, name));
      files.push(`/api/files/${name}`);
    };
    if (type === 'reel') {
      await move(`${out}.mp4`, `${id}.mp4`);
      await move(`${out}_cover.png`, `${id}-cover.png`).catch(() => {});
    } else if (type === 'carousel') {
      const slides = (await fs.readdir(out)).filter((f) => f.endsWith('.png')).sort();
      for (const [i, f] of slides.entries()) await move(path.join(out, f), `${id}-s${String(i + 1).padStart(2, '0')}.png`);
    } else {
      await move(`${out}.png`, `${id}.png`);
    }
    return NextResponse.json({ success: true, type, files });
  } catch (err) {
    console.error('[studio] error:', err?.stderr || err);
    const missing = err?.code === 'ENOENT';
    return NextResponse.json(
      { error: missing ? 'Python not found. Install Python 3 with pillow numpy imageio imageio-ffmpeg resvg-py.' : 'Studio render failed. Check server logs.' },
      { status: 500 },
    );
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
