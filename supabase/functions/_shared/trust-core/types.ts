export type Category =
  | 'bot' | 'spam' | 'crypto' | 'fake_giveaway' | 'ads' | 'ai_bot' | 'harassment';

export const CATEGORIES: Category[] =
  ['bot', 'spam', 'crypto', 'fake_giveaway', 'ads', 'ai_bot', 'harassment'];

export type AccountState = 'clean' | 'suspicious' | 'flagged';

// Tek bir raporun ağırlıklı puana katkısı için gereken girdiler.
export interface ReportInput {
  reporterReputation: number;
  ageDays: number;
}

export interface CategoryAggregate {
  category: Category;
  weightedScore: number;
  reporterCount: number;
}

export interface AccountVerdict {
  state: AccountState;
  topCategory: Category | null;
  maxScore: number;
  categories: CategoryAggregate[];
}

// Bir raporlayanın tek bir raporunun konsensüs bağlamı (itibar hesabı için).
export interface ReporterReportContext {
  categoryState: AccountState;
  categoryReporterCount: number;
}
