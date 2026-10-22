import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { PERSONAS_DIR, ensureDir, summarizePersona, saveRefImage, profileFromForm } from '@/lib/personas';
import { isValidSlug, validateCreatePersonaFields } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let entries = [];
  try {
    entries = await fs.readdir(PERSONAS_DIR, { withFileTypes: true });
  } catch { /* no personas yet */ }
  const names = entries.filter((e) => e.isDirectory() && isValidSlug(e.name)).map((e) => e.name);
  return NextResponse.json(await Promise.all(names.map(summarizePersona)));
}

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const parsed = validateCreatePersonaFields({
    name: form.get('name'),
    displayName: form.get('displayName'),
    description: form.get('description'),
    style: form.get('style'),
  });
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { name, displayName, description, style } = parsed.value;

  const dir = path.join(PERSONAS_DIR, name);
  try {
    await fs.access(dir);
    return NextResponse.json({ error: `Persona "${name}" already exists` }, { status: 409 });
  } catch { /* free to create */ }

  // Validate everything before writing anything.
  const profile = await profileFromForm(form);
  if (profile?.error) return NextResponse.json({ error: profile.error }, { status: 400 });

  await ensureDir(dir);
  await fs.writeFile(
    path.join(dir, 'identity.json'),
    JSON.stringify({ name: displayName, archetype: description, photo_style: style }, null, 2),
  );
  if (profile) await fs.writeFile(path.join(dir, 'profile.json'), JSON.stringify(profile.value, null, 2));

  const image = form.get('image');
  if (image && typeof image === 'object' && image.size > 0) {
    const saved = await saveRefImage(name, image);
    if (saved.error) {
      await fs.rm(dir, { recursive: true, force: true });
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }
  }

  return NextResponse.json({ success: true, persona: await summarizePersona(name) });
}
