import type { Metadata } from 'next';
import { DesignProvider } from '@/providers/design-provider';
import { PortalShell } from '@/components/portal-shell';
import { WelcomeOverlay } from '@/components/welcome-overlay';
import './globals.css';
import './welcome.css';
export const metadata: Metadata = {
  title: 'Espace participants · Infomil', description: 'Notes et bilans partagés de votre équipe.',
  robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><WelcomeOverlay /><div id="portal-content"><DesignProvider><PortalShell>{children}</PortalShell></DesignProvider></div><noscript><style>{'.welcome-overlay{display:none!important}body>#portal-content{visibility:visible!important}'}</style></noscript></body></html>;
}