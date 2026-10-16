import 'server-only';
import { masterEndpoint } from './proxy-policy';
export function serverConfig() {
  const endpoint = masterEndpoint(process.env.SCRUM_MASTER_URL);
  const secret = process.env.PARTICIPANT_PORTAL_SECRET;
  if (!endpoint || !secret || [...secret].length < 32 || /[\s\p{Cc}]/u.test(secret)) return null;
  return { endpoint, secret };
}