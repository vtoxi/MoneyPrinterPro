// ─── Shared persona/asset filesystem helpers ─────────────────
// Single source of truth for directory layout and reference-image lookup,
// so every API route resolves the same paths the same way.

import fs from 'fs/promises';
import path from 'path';
import { LIMITS, isAllowedImageMime, normalizeImageExt, parseProfileJson } from './validation.js';

export const ROOT = process.cwd();
export const REFERENCE_DIR = path.join(ROOT, 'assets', 'reference');
export const GENERATED_DIR = path.join(ROOT, 'assets', 'generated');
export const PERSONAS_DIR = path.join(ROOT, 'personas');
export const IDENTITY_DIR = path.join(ROOT, 'identity');

const REF_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/**
 * Locate the reference image for a persona slug.
 * Caller is expected to have validated `name` with isValidSlug first.
 * @returns {Promise<string|null>} absolute path, or null if none found.
 */
export async function findRefImage(name) {
  for (const ext of REF_EXTS) {
    const candidates = [
      path.join(REFERENCE_DIR, `${name}-ref${ext}`),
      path.join(PERSONAS_DIR, name, `ref${ext}`),
    ];
    for (const p of candidates) {
      if (await exists(p)) return p;
    }
  }
  return null;
}

/**
 * Read a persona's identity.json if present. Returns null on missing/malformed.
 */
export async function readIdentity(name) {
  const p = path.join(PERSONAS_DIR, name, 'identity.json');
  if (!(await exists(p))) return null;
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return null; }
}

/**
 * Read a persona's physical blueprint if present. Returns null on missing/malformed.
 */
export async function readBlueprint(name) {
  for (const p of [
    path.join(IDENTITY_DIR, `${name}_physical_blueprint.json`),
    path.join(PERSONAS_DIR, name, 'blueprint.json'),
  ]) {
    if (await exists(p)) {
      try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { /* skip */ }
    }
  }
  return null;
}

/** Character profile: free-form JSON (e.g. from ChatGPT) describing age, looks, personality... */
export async function readProfile(name) {
  const p = path.join(PERSONAS_DIR, name, 'profile.json');
  if (!(await exists(p))) return null;
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return null; }
}

/**
 * Flatten any profile JSON into one compact "key: value; ..." string for prompts.
 * Schema-agnostic on purpose: ChatGPT's JSON shape varies, so we don't hardcode keys.
 */
export function profileToPrompt(profile, max = 700) {
  if (!profile || typeof profile !== 'object') return '';
  const parts = [];
  const walk = (v, key) => {
    if (v == null || v === '') return;
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x !== 'object')) return parts.push(`${key}: ${v.join(', ')}`);
      return v.forEach((x) => walk(x, key));
    }
    if (typeof v === 'object') return Object.entries(v).forEach(([k, x]) => walk(x, k.replace(/_/g, ' ')));
    parts.push(`${key}: ${v}`);
  };
  walk(profile, 'character');
  const text = parts.join('; ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Delete every reference image for a persona (all lookup locations/extensions). */
export async function removeRefImages(name) {
  for (const ext of REF_EXTS) {
    for (const p of [path.join(REFERENCE_DIR, `${name}-ref${ext}`), path.join(PERSONAS_DIR, name, `ref${ext}`)]) {
      await fs.rm(p, { force: true });
    }
  }
}

/** Validate an uploaded File and store it as the persona's only reference image. Returns {error, status} on failure. */
export async function saveRefImage(name, file) {
  if (file.size > LIMITS.MAX_REF_IMAGE_BYTES) return { error: 'Reference image too large (max 8 MB)', status: 413 };
  if (!isAllowedImageMime(file.type)) return { error: 'Reference image must be JPG, PNG or WebP', status: 400 };
  const ext = normalizeImageExt(file.name, file.type);
  const buf = Buffer.from(await file.arrayBuffer());
  await removeRefImages(name);
  await ensureDir(path.join(PERSONAS_DIR, name));
  await fs.writeFile(path.join(PERSONAS_DIR, name, `ref.${ext}`), buf);
  return {};
}

/** Pull a profile out of a form: uploaded .json file wins over pasted text. Returns null if neither was given. */
export async function profileFromForm(form) {
  const file = form.get('profileFile');
  const text = file && typeof file === 'object' && file.size > 0 ? await file.text() : form.get('profile');
  if (typeof text !== 'string' || !text.trim()) return null;
  return parseProfileJson(text);
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/** Summarize a persona for list/detail responses. */
export async function summarizePersona(name) {
  const identity = await readIdentity(name);
  const [refPath, blueprintPath, hasProfile] = await Promise.all([
    findRefImage(name),
    exists(path.join(IDENTITY_DIR, `${name}_physical_blueprint.json`)),
    exists(path.join(PERSONAS_DIR, name, 'profile.json')),
  ]);
  return {
    name,
    displayName: identity?.name || name.charAt(0).toUpperCase() + name.slice(1),
    description: identity?.archetype || '',
    style: identity?.photo_style || 'lifestyle',
    hasRefImage: refPath !== null,
    hasBlueprint: blueprintPath,
    hasProfile,
  };
}
