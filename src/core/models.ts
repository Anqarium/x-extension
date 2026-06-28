export interface ReplyData {
  id: string;            // yorumun kararlı kimliği (permalink'ten tweet id)
  handle: string;        // @ olmadan, küçük harf
  displayName: string;
  text: string;
  likes: number;
  reposts: number;
  replies: number;
  isVerified: boolean;
  permalink: string;     // yoruma giden tam url
  avatarUrl: string | null;
}

export type TieBreaker = 'reposts' | 'replies';

export type FilterAction = 'show' | 'collapse';

export interface Settings {
  overlayEnabledByDefault: boolean;
  tieBreaker: TieBreaker;
  autoScrollDelayMs: number;
  theme: 'dark' | 'light' | 'system';
  animationsEnabled: boolean;
}

export interface Lists {
  blocklist: string[];   // küçük harf handle'lar, @ yok
  whitelist: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  overlayEnabledByDefault: true,
  tieBreaker: 'reposts',
  autoScrollDelayMs: 800,
  theme: 'dark',
  animationsEnabled: true
};

export const DEFAULT_LISTS: Lists = {
  blocklist: [],
  whitelist: []
};
