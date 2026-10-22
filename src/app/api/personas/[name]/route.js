import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  PERSONAS_DIR, summarizePersona, readProfile, saveRefImage, removeRefImages, profileFromForm,
} from '@/lib/personas';
import { isValidSlug } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolve(params) {
  const { name } = await params;
  if (!isValidSlug(name)) return { res: NextResponse.json({ error: 'Invalid persona' }, { status: 400 }) };
  try {
    await fs.access(path.join(PERSONAS_DIR, name));
  } catch {
    return { res: NextResponse.json({ error: 'Persona not found' }, { status: 404 }) };
  }
  return { name };
}

export async function GET(_request, { params }) {
  const { name, res } = await resolve(params);
  if (res) return res;
  return NextResponse.json({ ...(await summarizePersona(name)), profile: await readProfile(name) });
}

/** Update a persona: replace the reference image and/or the character profile JSON (multipart). */
export async function PUT(request, { params }) {
  const { name, res } = await resolve(params);
  if (res) return res;

  let form;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const profile = await profileFromForm(form);
  if (profile?.error) return NextResponse.json({ error: profile.error }, { status: 400 });

  const image = form.get('image');
  if (image && typeof image === 'object' && image.size > 0) {
    const saved = await saveRefImage(name, image);
    if (saved.error) return NextResponse.json({ error: saved.error }, { status: saved.status });
  }
  if (profile) await fs.writeFile(path.join(PERSONAS_DIR, name, 'profile.json'), JSON.stringify(profile.value, null, 2));

  return NextResponse.json({ success: true, persona: { ...(await summarizePersona(name)), profile: await readProfile(name) } });
}

/** DELETE ?what=image | profile */
export async function DELETE(request, { params }) {
  const { name, res } = await resolve(params);
  if (res) return res;
  const what = new URL(request.url).searchParams.get('what');
  if (what === 'image') await removeRefImages(name);
  else if (what === 'profile') await fs.rm(path.join(PERSONAS_DIR, name, 'profile.json'), { force: true });
  else return NextResponse.json({ error: 'what must be image or profile' }, { status: 400 });
  return NextResponse.json({ success: true, persona: { ...(await summarizePersona(name)), profile: await readProfile(name) } });
}
