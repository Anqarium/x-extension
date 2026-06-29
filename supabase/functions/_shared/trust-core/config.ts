export interface TrustConfig {
  halfLifeDays: number;
  suspiciousScore: number;
  suspiciousReporters: number;
  flaggedScore: number;
  flaggedReporters: number;
  disagreementMinReporters: number;
  repAlpha: number;
  repBeta: number;
  repMax: number;
  baselineReputation: number;
  dailyReportLimit: number;
}

export const DEFAULT_CONFIG: TrustConfig = {
  halfLifeDays: 180,
  suspiciousScore: 2.0,
  suspiciousReporters: 2,
  flaggedScore: 5.0,
  flaggedReporters: 3,
  disagreementMinReporters: 3,
  repAlpha: 1,
  repBeta: 2,
  repMax: 3.0,
  baselineReputation: 1.0,
  dailyReportLimit: 50,
};
