'use client';

import { useEffect, useRef, useState } from 'react';
import { PortalIcon } from './portal-icon';

// One introduction per document load, not on client-side navigation. No storage.
export function WelcomeOverlay() {
  const [open, setOpen] = useState(true);
  const skipRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const content = document.getElementById('portal-content');
    if (content) content.inert = true;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skipRef.current?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') { event.preventDefault(); skipRef.current?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    const timer = window.setTimeout(() => setOpen(false), 5000);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = overflow;
      if (content) content.inert = false;
      document.getElementById('contenu')?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return <div role="dialog" aria-modal="true"
    aria-labelledby="welcome-title" aria-describedby="welcome-description"
    className="welcome-overlay">
    <header className="welcome-top"><span className="welcome-brand">infomil<span> / </span>mauritius</span>
      <button ref={skipRef} type="button" onClick={() => setOpen(false)} className="welcome-skip" aria-label="Fermer l’introduction">Passer l’intro <PortalIcon name="arrow" className="size-5" /></button>
    </header>
      <div className="welcome-content">
        <p className="welcome-eyebrow">CHAQUE HUMEUR A SA PLACE.</p>
        <h1 id="welcome-title">Mood<span>Meter</span><span className="welcome-title-dot">.</span></h1>
        <div className="welcome-equalizer" aria-hidden="true">
          {(['moodCalm', 'moodHappy', 'moodGreat', 'moodHappy', 'moodGreat'] as const).map((mood, index) => <div className={`welcome-bar welcome-bar-${index}`} key={index}><PortalIcon name={mood} /></div>)}
        </div>
        <p id="welcome-description">Des humeurs différentes.<br /><strong>Une équipe qui avance ensemble.</strong></p>
      </div>
      <footer className="welcome-bottom"><span>VOTRE ESPACE D’ÉQUIPE</span><span>On se retrouve dans un instant</span></footer>
      <div className="welcome-timeline" aria-hidden="true"><span /></div>
  </div>;
}