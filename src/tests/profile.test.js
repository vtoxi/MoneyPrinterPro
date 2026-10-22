import { describe, it, expect } from 'vitest';
import { profileToPrompt } from '../lib/personas.js';
import { parseProfileJson } from '../lib/validation.js';

describe('profileToPrompt', () => {
  it('flattens nested ChatGPT-style JSON, skipping empties', () => {
    const t = profileToPrompt({ age: 26, personality: { nature: 'warm', hobbies: ['travel', 'music'] }, notes: null, x: '' });
    expect(t).toBe('age: 26; nature: warm; hobbies: travel, music');
  });
  it('caps length', () => {
    expect(profileToPrompt({ a: 'x'.repeat(2000) }, 100).length).toBeLessThanOrEqual(101);
  });
  it('returns empty for non-objects', () => {
    expect(profileToPrompt(null)).toBe('');
  });
});

describe('parseProfileJson', () => {
  it('accepts objects, rejects arrays / garbage / empty', () => {
    expect(parseProfileJson('{"a":1}').value).toEqual({ a: 1 });
    expect(parseProfileJson('[1]').error).toBeTruthy();
    expect(parseProfileJson('nope').error).toBeTruthy();
    expect(parseProfileJson('  ').error).toBeTruthy();
  });
});
