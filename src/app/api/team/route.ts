import 'server-only';
import { createTeamProxy } from '@/lib/team-proxy';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const { GET, PUT } = createTeamProxy(serverConfig);