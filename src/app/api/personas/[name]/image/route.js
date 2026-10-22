import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { findRefImage, MIME_BY_EXT } from '@/lib/personas';
import { isValidSlug } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { name } = await params;
  if (!isValidSlug(name)) return new NextResponse('Invalid persona', { status: 400 });
  const ref = await findRefImage(name);
  if (!ref) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(await fs.readFile(ref), {
    headers: { 'Content-Type': MIME_BY_EXT[path.extname(ref).toLowerCase()] || 'image/jpeg' },
  });
}
