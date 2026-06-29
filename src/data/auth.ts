import { CLOUD, cloudConfigured } from './cloud-config';

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

const SESSION_KEY = 'cloud_session';

export type Provider = 'google' | 'twitter';

function redirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

// Supabase OAuth akışı: launchWebAuthFlow ile authorize URL açılır,
// dönen fragment'tan access/refresh token alınır.
export async function signIn(provider: Provider): Promise<Session> {
  if (!cloudConfigured()) throw new Error('cloud_not_configured');
  const authUrl =
    `${CLOUD.url}/auth/v1/authorize?provider=${provider}` +
    `&redirect_to=${encodeURIComponent(redirectUrl())}`;

  const redirect = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!redirect) throw new Error('auth_cancelled');

  const fragment = new URL(redirect).hash.replace(/^#/, '');
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = Number(params.get('expires_in') ?? '3600');
  if (!accessToken || !refreshToken) throw new Error('no_token');

  const session: Session = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

async function readSession(): Promise<Session | null> {
  const raw = await chrome.storage.local.get([SESSION_KEY]);
  return (raw[SESSION_KEY] as Session | undefined) ?? null;
}

async function refresh(session: Session): Promise<Session | null> {
  try {
    const res = await fetch(`${CLOUD.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLOUD.anonKey },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    const next: Session = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    await chrome.storage.local.set({ [SESSION_KEY]: next });
    return next;
  } catch {
    return null;
  }
}

// Geçerli (gerekirse yenilenmiş) oturum; yoksa null.
export async function getValidSession(): Promise<Session | null> {
  const session = await readSession();
  if (!session) return null;
  if (Date.now() < session.expiresAt - 60_000) return session;
  return refresh(session);
}

export async function isSignedIn(): Promise<boolean> {
  return (await getValidSession()) !== null;
}

export async function signOut(): Promise<void> {
  await chrome.storage.local.remove([SESSION_KEY]);
}
