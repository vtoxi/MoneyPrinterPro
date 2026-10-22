'use client';
import { useState, useEffect, useRef, use } from 'react';
import Link from 'next/link';
import {
  IconArrowLeft, IconUser, IconDownload, IconSparkles,
} from '@/components/icons';
import Lightbox from '@/components/Lightbox';

const STYLES = [
  { id: 'lifestyle',        label: 'Lifestyle' },
  { id: 'urban_power',      label: 'Urban' },
  { id: 'music_life',       label: 'Music' },
  { id: 'travel',           label: 'Travel' },
  { id: 'executive',        label: 'Executive' },
  { id: 'luxury_editorial', label: 'Luxury' },
  { id: 'creative',         label: 'Creative' },
];

const SHOTS = [
  { id: '',                       label: 'Auto' },
  { id: 'three_quarter_candid',   label: '3/4 candid' },
  { id: 'full_body_walk',         label: 'Full body' },
  { id: 'portrait_close',         label: 'Close-up' },
  { id: 'portrait_three_quarter', label: 'Portrait 3/4' },
  { id: 'over_shoulder',          label: 'Over shoulder' },
];

const OUTPUT_TYPES = [
  { id: 'image', label: '📸 Image', desc: '~5s' },
  { id: 'video', label: '🎬 Video', desc: '~3min' },
  { id: 'both',  label: '✨ Both',  desc: '~3.5min' },
];

export default function GeneratePage({ params }) {
  const { persona: personaName } = use(params);
  const [persona, setPersona] = useState(null);
  const [outputType, setOutputType] = useState('image');
  const [style, setStyle] = useState('lifestyle');
  const [location, setLocation] = useState('');
  const [shotType, setShotType] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [imgV, setImgV] = useState(0); // cache-buster for the reference image
  const [profileText, setProfileText] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const imageInput = useRef(null);
  const profileInput = useRef(null);

  useEffect(() => {
    fetch(`/api/personas/${personaName}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Persona not found'))))
      .then((p) => { setPersona(p); setProfileText(p.profile ? JSON.stringify(p.profile, null, 2) : ''); })
      .catch(() => {
        setPersona({ name: personaName, displayName: personaName, description: '' });
        setError(`Persona "${personaName}" doesn't exist. Create it from New persona.`);
      });
  }, [personaName]);

  // Persona edits: image replace, profile save/upload, remove. All go through /api/personas/[name].
  async function updatePersona(req, query = '') {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/personas/${personaName}${query}`, req);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setPersona((p) => ({ ...p, ...data.persona }));
      setProfileText(data.persona.profile ? JSON.stringify(data.persona.profile, null, 2) : '');
      setImgV(Date.now());
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function putForm(fields) {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    return updatePersona({ method: 'PUT', body: form });
  }

  async function removePart(what) {
    if (!window.confirm(`Remove the ${what === 'image' ? 'reference image' : 'character profile'}?`)) return;
    await updatePersona({ method: 'DELETE' }, `?what=${what}`);
  }

  async function generateImage(apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600000);
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-pollinations-key': localStorage.getItem('pollinations_api_key') || '',
      },
      signal: controller.signal,
      body: JSON.stringify({
        persona: personaName,
        style,
        outputType: 'image',
        location: location || undefined,
        shotType: shotType || undefined,
        customPrompt: customPrompt || undefined,
      }),
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Image generation failed');
    return data;
  }

  async function generateVideoFromImage(apiKey, imageResult) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 360000); // 6 min timeout for video
    const res = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        persona: personaName,
        caption: location || style,
        style,
        imagePath: imageResult?.imagePath || undefined,
        promptMeta: {
          shot: shotType || 'medium shot',
          location: location || 'urban setting',
          lighting: 'natural lighting',
          motion_profile: 'subtle',
        },
      }),
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Video generation failed');
    return data;
  }

  async function handleGenerate() {
    setError(null);
    const apiKey = localStorage.getItem('gemini_api_key');
    // Images work without a key (free fallback); video needs one.
    if (!apiKey && outputType !== 'image') {
      setError('Video needs a Gemini key. Go to Settings, or switch to image output.');
      return;
    }

    setGenerating(true);
    setResult(null);
    setProgress(5);

    const isVideo = outputType === 'video' || outputType === 'both';
    const isImage = outputType === 'image' || outputType === 'both';

    // Progress timer
    let prog = 5;
    const maxProg = isVideo ? 95 : 92;
    const interval = isVideo ? 5000 : 1500;
    const increment = isVideo ? 3 : 7;

    setProgressText(isVideo ? 'Preparing video generation…' : 'Sending to Gemini…');

    const timer = setInterval(() => {
      prog = Math.min(prog + Math.random() * increment, maxProg);
      setProgress(Math.round(prog));

      if (isVideo) {
        if (prog < 15)      setProgressText('Sending to Gemini…');
        else if (prog < 30) setProgressText(isImage ? 'Generating image…' : 'Preparing for VEO…');
        else if (prog < 50) setProgressText('Generating video with VEO…');
        else if (prog < 70) setProgressText('Still rendering… (this can take 2-5 min)');
        else if (prog < 85) setProgressText('Almost there…');
        else                setProgressText('Finalizing video…');
      } else {
        if (prog < 25)      setProgressText('Sending to Gemini…');
        else if (prog < 50) setProgressText('Generating image…');
        else if (prog < 75) setProgressText('Refining details…');
        else                setProgressText('Finalizing…');
      }
    }, interval);

    try {
      let imageData = null;
      let videoData = null;

      // Generate image (for 'image' or 'both')
      if (isImage) {
        imageData = await generateImage(apiKey);
      }

      // Generate video (for 'video' or 'both')
      if (isVideo) {
        videoData = await generateVideoFromImage(apiKey, imageData);
      }

      clearInterval(timer);

      // Build result object
      const finalResult = {
        success: true,
        outputType,
        ...(imageData ? { imageUrl: imageData.imageUrl, model: imageData.model } : {}),
        ...(videoData ? { videoUrl: videoData.videoUrl, videoModel: 'veo-3.1' } : {}),
        duration_ms: (imageData?.duration_ms || 0) + (videoData?.duration_ms || 0),
        model: videoData ? 'veo-3.1' : (imageData?.model || 'gemini'),
        usedEngines: imageData?.usedEngines || false,
      };

      setProgress(100);
      setProgressText(`Done in ${(finalResult.duration_ms / 1000).toFixed(1)}s`);
      setResult(finalResult);
      setHistory((prev) => [finalResult, ...prev].slice(0, 12));
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      setError(err.name === 'AbortError' ? 'Timeout — generation took too long' : err.message);
    } finally {
      setGenerating(false);
    }
  }

  if (!persona) {
    return (
      <div className="empty">
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="spinner" /> Loading persona…
        </div>
      </div>
    );
  }

  const resultIsVideo = result?.videoUrl && !result?.imageUrl;
  const resultHasVideo = !!result?.videoUrl;
  const resultHasImage = !!result?.imageUrl;

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="h1">{persona.displayName}</h1>
          <p className="subtitle">{persona.description || 'Generate AI images & videos for this persona.'}</p>
        </div>
        <Link href="/" className="btn btn-ghost"><IconArrowLeft /> Back</Link>
      </div>

      <div className="gen-layout">
        {/* Sidebar: reference + history */}
        <div className="gen-side">
          <div className="card card-tight">
            <div className="section-label">Reference</div>
            {persona.hasRefImage ? (
              <img
                className="ref-preview"
                src={`/api/personas/${persona.name}/image?v=${imgV}`}
                alt={persona.displayName}
                title="Click to enlarge"
                style={{ cursor: 'zoom-in' }}
                onClick={() => setLightbox(`/api/personas/${persona.name}/image?v=${imgV}`)}
              />
            ) : (
              <div className="ref-placeholder"><IconUser size={32} /></div>
            )}
            <div className="row mt-12" style={{ gap: 6, flexWrap: 'wrap' }}>
              {persona.hasRefImage  && <span className="badge"><span className="dot" style={{ color: 'var(--success)' }} /> Ref</span>}
              {persona.hasProfile   && <span className="badge"><span className="dot" style={{ color: 'var(--accent)' }} /> Profile</span>}
              {persona.hasBlueprint && <span className="badge"><span className="dot" style={{ color: 'var(--accent)' }} /> Blueprint</span>}
            </div>
            <input
              ref={imageInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) putForm({ image: f }); }}
            />
            <div className="row mt-12" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => imageInput.current?.click()}>
                {persona.hasRefImage ? 'Replace image' : 'Upload image'}
              </button>
              {persona.hasRefImage && (
                <button type="button" className="btn btn-danger" disabled={saving} onClick={() => removePart('image')}>Remove</button>
              )}
            </div>
          </div>

          <div className="card card-tight">
            <div className="row-between">
              <div className="section-label" style={{ margin: 0 }}>Character profile (JSON)</div>
              {persona.hasProfile && <span className="badge badge-success"><span className="dot" /> Active</span>}
            </div>
            <p className="faint mt-12" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Paste or upload the JSON from ChatGPT (age, look, personality…). It is added to every image and video prompt to keep this character consistent.
            </p>
            {editingProfile && (
              <textarea
                className="textarea mt-12"
                rows={10}
                spellCheck={false}
                placeholder={'{ "age": 26, "personality": "confident, warm" }'}
                value={profileText}
                onChange={(e) => setProfileText(e.target.value)}
                style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
              />
            )}
            <input
              ref={profileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) putForm({ profileFile: f }); }}
            />
            <div className="row mt-12" style={{ gap: 6, flexWrap: 'wrap' }}>
              {editingProfile ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving || !profileText.trim()}
                    onClick={async () => { if (await putForm({ profile: profileText })) setEditingProfile(false); }}
                  >
                    Save
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingProfile(false)}>Cancel</button>
                </>
              ) : (
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setEditingProfile(true)}>
                  {persona.hasProfile ? 'View / edit' : 'Paste JSON'}
                </button>
              )}
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => profileInput.current?.click()}>Upload .json</button>
              {persona.hasProfile && (
                <button type="button" className="btn btn-danger" disabled={saving} onClick={() => removePart('profile')}>Remove</button>
              )}
            </div>
          </div>

          {history.length > 0 && (
            <div className="card card-tight">
              <div className="section-label">Recent ({history.length})</div>
              <div className="thumbs">
                {history.map((h, i) => (
                  <div key={i} className="thumb-wrap" onClick={() => setResult(h)}>
                    {h.imageUrl ? (
                      <img src={h.imageUrl} alt="" className="thumb" />
                    ) : (
                      <div className="thumb thumb-video">🎬</div>
                    )}
                    {h.videoUrl && h.imageUrl && (
                      <div className="thumb-badge">🎬</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main */}
        <div className="gen-main">
          {/* Output Type Selector */}
          <div className="card">
            <div className="section-label">Output Type</div>
            <div className="option-grid">
              {OUTPUT_TYPES.map((t) => (
                <div
                  key={t.id}
                  className={`option${outputType === t.id ? ' active' : ''}`}
                  onClick={() => setOutputType(t.id)}
                >
                  <div className="option-title">{t.label}</div>
                  <div className="faint" style={{ fontSize: 11 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-label">Style</div>
            <div className="option-grid">
              {STYLES.map((s) => (
                <div
                  key={s.id}
                  className={`option${style === s.id ? ' active' : ''}`}
                  onClick={() => setStyle(s.id)}
                >
                  <div className="option-title">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-label">Shot / framing</div>
            <div className="option-grid">
              {SHOTS.map((s) => (
                <div
                  key={s.id || 'auto'}
                  className={`option${shotType === s.id ? ' active' : ''}`}
                  onClick={() => setShotType(s.id)}
                >
                  <div className="option-title">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="label">Location (optional)</label>
              <input
                className="input"
                placeholder="Milan, Paris, beach, studio…"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label">Custom prompt (optional)</label>
              <textarea
                className="textarea"
                rows={3}
                placeholder="Override the auto-generated prompt…"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-lg btn-block"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? <><span className="spinner" /> Generating…</> : <><IconSparkles /> Generate {outputType === 'video' ? 'Video' : outputType === 'both' ? 'Image + Video' : 'Image'}</>}
          </button>

          {(generating || progress > 0) && (
            <div className="card card-tight">
              <div className="progress">
                <div className="progress-row">
                  <span>{progressText}</span>
                  <span className="mono">{progress}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="status-row error">
              <span className="dot" style={{ color: 'var(--danger)' }} />
              <span>{error}</span>
            </div>
          )}

          {result && result.success && (
            <div className="card">
              <div className="row-between mb-12">
                <div className="section-label" style={{ margin: 0 }}>Result</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {result.usedEngines && <span className="badge" style={{ background: 'rgba(94,106,210,0.2)', color: 'var(--accent)' }}>⚡ Engines</span>}
                  <span className="faint mono">{result.model}</span>
                </div>
              </div>

              {/* Image result */}
              {resultHasImage && (
                <img
                  src={result.imageUrl}
                  alt="Generated"
                  className="result-image"
                  title="Click to enlarge"
                  style={{ cursor: 'zoom-in' }}
                  onClick={() => setLightbox(result.imageUrl)}
                />
              )}

              {/* Video result */}
              {resultHasVideo && (
                <video
                  src={result.videoUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="result-image"
                  style={{ marginTop: resultHasImage ? 12 : 0 }}
                />
              )}

              <div className="row mt-12" style={{ gap: 8 }}>
                {resultHasImage && (
                  <a href={result.imageUrl} download className="btn btn-secondary">
                    <IconDownload /> Image
                  </a>
                )}
                {resultHasVideo && (
                  <a href={result.videoUrl} download className="btn btn-secondary">
                    <IconDownload /> Video
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .thumb-wrap {
          position: relative;
          cursor: pointer;
        }
        .thumb-badge {
          position: absolute;
          bottom: 2px;
          right: 2px;
          font-size: 10px;
          background: rgba(0,0,0,0.7);
          border-radius: 4px;
          padding: 1px 3px;
          line-height: 1;
        }
        .thumb-video {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(94,106,210,0.15);
          font-size: 18px;
        }
      `}</style>
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
