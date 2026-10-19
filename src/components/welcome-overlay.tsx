'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog } from '@mui/material';
import { PortalIcon } from './portal-icon';
import '@/app/welcome.css';

// One introduction per document load, not on client-side navigation. No storage.
export function WelcomeOverlay() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  return <Dialog open={open} onClose={() => setOpen(false)} fullScreen
    aria-labelledby="welcome-title" aria-describedby="welcome-description"
    className="welcome-overlay" disableRestoreFocus
    slotProps={{ transition: { onExited: () => document.getElementById('contenu')?.focus({ preventScroll: true }) } }}>
    <div className="welcome-scene">
      <div className="welcome-aurora welcome-aurora-one" aria-hidden="true" />
      <div className="welcome-aurora welcome-aurora-two" aria-hidden="true" />
      <div className="welcome-grid" aria-hidden="true" />
      <Button autoFocus onClick={() => setOpen(false)} className="welcome-skip"
        endIcon={<PortalIcon name="close" className="size-5" />} aria-label="Fermer l’introduction">Passer l’intro</Button>
      <div className="welcome-content">
        <p className="welcome-brand">INFOMIL <span>·</span> MAURITIUS</p>
        <div className="welcome-meter" aria-hidden="true">
          <div className="welcome-ring welcome-ring-outer" />
          <div className="welcome-ring welcome-ring-inner" />
          <span className="welcome-mood welcome-mood-calm"><PortalIcon name="moodCalm" /></span>
          <span className="welcome-mood welcome-mood-happy"><PortalIcon name="moodHappy" /></span>
          <span className="welcome-mood welcome-mood-great"><PortalIcon name="moodGreat" /></span>
          <div className="welcome-meter-core"><PortalIcon name="moodGreat" /></div>
          <span className="welcome-spark welcome-spark-one"><PortalIcon name="spark" /></span>
          <span className="welcome-spark welcome-spark-two"><PortalIcon name="spark" /></span>
        </div>
        <div className="welcome-copy"><p className="welcome-eyebrow">UN INSTANT POUR SE RETROUVER</p>
          <h1 id="welcome-title">Mood<span>Meter</span><span className="welcome-title-dot">.</span></h1>
          <p id="welcome-description">Votre humeur. Votre équipe.<br /><strong>Une belle énergie, ensemble.</strong></p>
        </div>
        <div className="welcome-timeline" aria-hidden="true"><span /></div>
        <p className="welcome-footnote">Votre espace s’ouvre dans quelques instants</p>
      </div>
      <span className="welcome-corner" aria-hidden="true">LES BONNES ÉNERGIES SE PARTAGENT.</span>
    </div>
  </Dialog>;
}