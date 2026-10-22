'use client';
import { useState } from 'react';

const TYPES = [
  { id: 'reel', label: '🎬 Reel', hint: 'Animated 9:16 video with music' },
  { id: 'carousel', label: '🗂 Carousel', hint: 'Swipeable 4:5 slides' },
  { id: 'story', label: '📱 Story', hint: 'Single 9:16 card' },
];
const blank = () => ({ title: '', sub: '', seconds: 4 });

export default function StudioPage() {
  const [type, setType] = useState('reel');
  const [handle, setHandle] = useState('');
  const [items, setItems] = useState([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]);

  const multi = type !== 'story';
  const setItem = (i, patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    setFiles([]);
    const body = { type, handle: handle || undefined };
    const filled = items.filter((x) => x.title.trim());
    if (type === 'reel') body.scenes = filled;
    else if (type === 'carousel') body.slides = filled;
    else Object.assign(body, filled[0] || {});
    try {
      const res = await fetch('/api/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render failed');
      setFiles(data.files);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="h1">Studio</h1>
          <p className="subtitle">Free, offline reels, carousels and story cards from text. No API key needed.</p>
        </div>
      </div>

      <div className="grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div className="section-label">Format</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`btn ${type === t.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setType(t.id)}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="field mt-16" style={{ marginBottom: 0 }}>
              <label className="label">Handle shown on the media (optional)</label>
              <input className="input" placeholder="@yourhandle" value={handle} maxLength={40} onChange={(e) => setHandle(e.target.value)} />
            </div>
          </div>

          {(multi ? items : items.slice(0, 1)).map((it, i) => (
            <div className="card" key={i}>
              <div className="row-between mb-12">
                <div className="section-label" style={{ margin: 0 }}>
                  {type === 'reel' ? `Scene ${i + 1}` : type === 'carousel' ? `Slide ${i + 1}` : 'Card'}
                </div>
                {multi && items.length > 1 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>Remove</button>
                )}
              </div>
              <div className="field">
                <label className="label">Title</label>
                <textarea className="input" rows={2} maxLength={200} value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Hook or headline" />
              </div>
              <div className="field" style={{ marginBottom: type === 'reel' ? undefined : 0 }}>
                <label className="label">Subtitle (optional)</label>
                <textarea className="input" rows={2} maxLength={300} value={it.sub} onChange={(e) => setItem(i, { sub: e.target.value })} />
              </div>
              {type === 'reel' && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Seconds (2-10)</label>
                  <input type="number" min={2} max={10} className="input" value={it.seconds} onChange={(e) => setItem(i, { seconds: e.target.value })} />
                </div>
              )}
            </div>
          ))}

          <div className="row" style={{ gap: 8 }}>
            {multi && items.length < 10 && (
              <button type="button" className="btn btn-secondary" onClick={() => setItems((xs) => [...xs, blank()])}>
                + Add {type === 'reel' ? 'scene' : 'slide'}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={busy || !items.some((x) => x.title.trim())}>
              {busy ? <><span className="spinner" /> Rendering… (reels take a minute or two)</> : 'Generate'}
            </button>
          </div>
          {error && <div className="status-row error"><span>{error}</span></div>}
        </div>

        <div className="card">
          <div className="section-label">Result</div>
          {files.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Your media will appear here.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {files.map((f) =>
              f.endsWith('.mp4') ? (
                <video key={f} src={f} controls style={{ width: '100%', maxWidth: 320, borderRadius: 8 }} />
              ) : (
                <a key={f} href={f} download>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f} alt="" style={{ width: '100%', maxWidth: 320, borderRadius: 8 }} />
                </a>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
