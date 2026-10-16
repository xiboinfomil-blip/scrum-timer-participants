import { StateScreen } from '@/components/ui';
import { TOKEN_PATTERN } from '@/lib/contracts';
import { serverConfig } from '@/lib/server-config';
import { TeamPortal } from './_components/team-portal';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function TeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) return <StateScreen title="Lien d’équipe invalide"><p>Demandez un nouveau lien à votre scrum master. Aucun annuaire n’est disponible ici.</p></StateScreen>;
  if (!serverConfig()) return <StateScreen title="Configuration indisponible"><p>Le portail n’est pas encore connecté au serveur maître. Contactez votre scrum master.</p></StateScreen>;
  return <TeamPortal token={token} />;
}