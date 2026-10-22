'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STYLES = ['lifestyle', 'urban_power', 'music_life', 'travel', 'executive', 'luxury_editorial', 'creative'];

export default function NewPersonaPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/personas', { method: 'POST', body: new FormData(e.currentTarget) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create persona');
      router.push(`/generate/${data.persona.name}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="h1">New persona</h1>
          <p className="subtitle">Create a persona. A reference image keeps the face consistent (Gemini only).</p>
        </div>
      </div>

      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
        <div className="field">
          <label className="label">Name (id)</label>
          <input name="name" className="input" placeholder="ava" required maxLength={40} />
        </div>
        <div className="field">
          <label className="label">Display name</label>
          <input name="displayName" className="input" placeholder="Ava" maxLength={80} />
        </div>
        <div className="field">
          <label className="label">Description</label>
          <textarea name="description" className="input" rows={3} maxLength={500} placeholder="Confident young executive…" />
        </div>
        <div className="field">
          <label className="label">Style</label>
          <select name="style" className="input" defaultValue="lifestyle">
            {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label">Reference image (optional, JPG/PNG/WebP, max 8 MB)</label>
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="input" />
        </div>
        <div className="field">
          <label className="label">Character profile JSON from ChatGPT (optional, keeps the character consistent)</label>
          <textarea name="profile" className="input" rows={5} spellCheck={false} placeholder={'{ "age": 26, "personality": "confident, warm" }'} />
          <input name="profileFile" type="file" accept="application/json,.json" className="input mt-12" />
        </div>
        {error && <div className="status-row error"><span>{error}</span></div>}
        <button className="btn btn-primary mt-16" disabled={busy}>
          {busy ? 'Creating…' : 'Create persona'}
        </button>
      </form>
    </div>
  );
}
