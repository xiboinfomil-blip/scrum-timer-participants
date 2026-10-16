import type { Metadata } from 'next';
import { DesignProvider } from '@/providers/design-provider';
import { PortalShell } from '@/components/portal-shell';
import './globals.css';
export const metadata: Metadata = {
  title: 'Espace participants · Infomil', description: 'Notes et bilans partagés de votre équipe.',
  robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><DesignProvider><PortalShell>{children}</PortalShell></DesignProvider></body></html>;
}