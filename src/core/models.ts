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

export type Category =
  | 'bot' | 'spam' | 'crypto' | 'fake_giveaway' | 'ads' | 'ai_bot' | 'harassment';

export const CATEGORIES: Category[] =
  ['bot', 'spam', 'crypto', 'fake_giveaway', 'ads', 'ai_bot', 'harassment'];

export const CATEGORY_LABELS: Record<Category, string> = {
  bot: 'Bot',
  spam: 'Spam',
  crypto: 'Kripto Dolandırıcılığı',
  fake_giveaway: 'Sahte Çekiliş',
  ads: 'Sürekli Reklam',
  ai_bot: 'Yapay Zekâ Botu',
  harassment: 'Taciz',
};

export type AccountState = 'clean' | 'suspicious' | 'flagged';

export interface Verdict {
  handle: string;
  state: AccountState;
  topCategory: Category | null;
  maxScore: number;
}

export type SuspiciousAction = 'off' | 'badge' | 'collapse';
export type FlaggedAction = 'warn' | 'collapse' | 'remove' | 'autoblock';

export interface CommunityFilterSettings {
  enabled: boolean;
  suspiciousAction: SuspiciousAction;
  flaggedAction: FlaggedAction;
  enabledCategories: Category[];
}

export const DEFAULT_COMMUNITY: CommunityFilterSettings = {
  enabled: true,
  suspiciousAction: 'badge',
  flaggedAction: 'collapse',
  enabledCategories: ['bot', 'spam', 'crypto', 'fake_giveaway', 'ads', 'ai_bot', 'harassment'],
};

// Verdikt-farkında filtre kararı
export interface FilterDecision {
  action: 'show' | 'collapse' | 'badge' | 'remove';
  autoblock: boolean;
  reason: 'whitelist' | 'blocklist' | 'community' | 'none';
  category: Category | null;
}

export interface Settings {
  overlayEnabledByDefault: boolean;
  tieBreaker: TieBreaker;
  autoScrollDelayMs: number;
  theme: 'dark' | 'light' | 'system';
  animationsEnabled: boolean;
  community: CommunityFilterSettings;
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
  animationsEnabled: true,
  community: DEFAULT_COMMUNITY,
};

export const DEFAULT_LISTS: Lists = {
  blocklist: [],
  whitelist: []
};
