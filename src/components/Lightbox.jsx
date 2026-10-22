'use client';
import { useEffect } from 'react';

/** Full-screen image preview. Click anywhere or press Esc to close. */
export default function Lightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src) return null;
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-label="Image preview"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onClose}
        style={{ position: 'absolute', top: 16, right: 16 }}
      >
        Close ✕
      </button>
    </div>
  );
}
