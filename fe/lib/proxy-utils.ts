import { NextRequest } from 'next/server';

export function getForwardHeaders(req: NextRequest, accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Forward custom user profile / agent config headers
  const agentDepth = req.headers.get('x-agent-depth');
  if (agentDepth) headers['X-Agent-Depth'] = agentDepth;

  const defenseIntensity = req.headers.get('x-defense-intensity');
  if (defenseIntensity) headers['X-Defense-Intensity'] = defenseIntensity;

  const translationStyle = req.headers.get('x-translation-style');
  if (translationStyle) headers['X-Translation-Style'] = translationStyle;

  const academicRole = req.headers.get('x-academic-role');
  if (academicRole) headers['X-Academic-Role'] = academicRole;

  const academicAffiliation = req.headers.get('x-academic-affiliation');
  if (academicAffiliation) headers['X-Academic-Affiliation'] = academicAffiliation;

  return headers;
}
