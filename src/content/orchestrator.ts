import { DataProvider, createChromeBackend } from '../data/data-provider';
import { ReplyCollector } from './collector';
import { SortedOverlay } from './overlay/overlay';
import { injectBlockButton } from './block-injector';
import { injectReportButton } from './report-menu';
import { applyDecision } from './community-apply';
import { loadAllReplies } from './auto-scroll';
import { sortReplies } from '../core/sort-engine';
import { decideFilter } from '../core/filter-engine';
import { findReplyArticles, getHandleFromArticle } from './adapters/x-selectors';
import { onMessage } from '../shared/messaging';
import { VerdictCache } from '../data/verdict-cache';
import { fetchVerdicts, submitReport } from '../data/cloud-provider';
import { getValidSession } from '../data/auth';
import { cloudConfigured } from '../data/cloud-config';
import type { Settings, Lists, Category } from '../core/models';

const VERDICT_TTL_MS = 24 * 60 * 60 * 1000;

const dp = new DataProvider(createChromeBackend());
const collector = new ReplyCollector();
const verdicts = new VerdictCache(VERDICT_TTL_MS);

let settings: Settings;
let lists: Lists;
let overlay: SortedOverlay | null = null;
let overlayVisible = false;
let loadingAll = false;
let observer: MutationObserver;
let scheduled = false;
let lastSig = '';
let signedIn = false;
const pendingHandles = new Set<string>();
let fetchTimer: number | undefined;

function isThreadPage(): boolean {
  return /\/status\/\d+/.test(location.pathname);
}

function refreshOverlay(force = false): void {
  if (!overlay || !overlayVisible) return;
  const sorted = sortReplies(collector.all(), settings.tieBreaker);
  const sig = sorted.map((r) => `${r.id}:${r.likes}`).join(',') + `|${loadingAll}`;
  if (!force && sig === lastSig) return;
  lastSig = sig;
  overlay.render(sorted, loadingAll);
}

function mountOverlayIfNeeded(): void {
  if (!isThreadPage() || !overlayVisible) return;
  const firstArticle = document.querySelector<HTMLElement>('article[data-testid="tweet"]');
  if (!firstArticle) return;
  if (!overlay) {
    overlay = new SortedOverlay(settings.animationsEnabled, {
      onLoadAll: () => { void doLoadAll(); },
      onClose: () => toggleOverlay(false),
    });
  }
  overlay.mountBefore(firstArticle);
}

function toggleOverlay(show: boolean): void {
  overlayVisible = show;
  if (!show) { overlay?.unmount(); return; }
  mountOverlayIfNeeded();
  refreshOverlay(true);
}

async function doLoadAll(): Promise<void> {
  if (loadingAll) return;
  loadingAll = true;
  refreshOverlay(true);
  await loadAllReplies({ delayMs: settings.autoScrollDelayMs, onStep: () => collector.ingestFrom(document) });
  loadingAll = false;
  refreshOverlay(true);
}

// Görünen handle'lardan eksik verdiktleri toplayıp debounce ile toplu çeker.
function queueVerdictFetch(handle: string): void {
  if (!cloudConfigured() || !settings.community.enabled) return;
  if (verdicts.missing([handle]).length === 0) return;
  pendingHandles.add(handle);
  if (fetchTimer !== undefined) return;
  fetchTimer = setTimeout(() => { void flushVerdictFetch(); }, 500) as unknown as number;
}

async function flushVerdictFetch(): Promise<void> {
  fetchTimer = undefined;
  const handles = verdicts.missing([...pendingHandles]);
  pendingHandles.clear();
  if (handles.length === 0) return;
  const fetched = await fetchVerdicts(handles);
  verdicts.setMany(fetched);
  // Sunucuda kaydı olmayan handle'ları "clean" say (tekrar tekrar sorma).
  for (const h of handles) {
    if (!fetched.some((v) => v.handle === h)) {
      verdicts.set({ handle: h, state: 'clean', topCategory: null, maxScore: 0 });
    }
  }
  scanAndApply();
}

function applyToArticle(article: HTMLElement): void {
  const handle = getHandleFromArticle(article);
  if (!handle) return;
  const verdict = verdicts.get(handle);
  if (verdict === null) queueVerdictFetch(handle);
  const decision = decideFilter(handle, lists, verdict, settings.community);
  if (decision.autoblock) {
    void dp.addToBlocklist(handle);
  }
  applyDecision(article, handle, decision);
}

function processArticles(): void {
  collector.ingestFrom(document);
  for (const article of findReplyArticles(document)) {
    injectBlockButton(article, {
      onBlock: async (handle) => {
        await dp.addToBlocklist(handle);
        lists = await dp.getLists();
        scanAndApply();
      },
    });
    injectReportButton(article, {
      isSignedIn: () => signedIn,
      onReport: (handle, category) => { void doReport(handle, category); },
      onNeedLogin: () => { void chrome.runtime.openOptionsPage(); },
    });
    applyToArticle(article);
  }
  if (overlayVisible) { mountOverlayIfNeeded(); refreshOverlay(); }
}

function scanAndApply(): void {
  for (const article of findReplyArticles(document)) applyToArticle(article);
}

async function doReport(handle: string, category: Category): Promise<void> {
  const session = await getValidSession();
  if (!session) { void chrome.runtime.openOptionsPage(); return; }
  const result = await submitReport(handle, category, session.accessToken);
  if (result.ok && result.verdict) {
    verdicts.set(result.verdict);
    scanAndApply();
  }
}

function scheduleProcess(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    observer.disconnect();
    try { processArticles(); }
    finally { observer.observe(document.body, { childList: true, subtree: true }); }
  });
}

async function loadVerdictCacheFromStorage(): Promise<void> {
  const raw = await chrome.storage.local.get(['verdict_cache']);
  verdicts.loadFrom(raw['verdict_cache'] as Record<string, never> | undefined);
}

async function init(): Promise<void> {
  settings = await dp.getSettings();
  lists = await dp.getLists();
  signedIn = (await getValidSession()) !== null;
  await loadVerdictCacheFromStorage();
  overlayVisible = settings.overlayEnabledByDefault && isThreadPage();

  observer = new MutationObserver(scheduleProcess);
  observer.observe(document.body, { childList: true, subtree: true });

  onMessage(async (msg) => {
    if (msg.type === 'LISTS_CHANGED') { lists = await dp.getLists(); scanAndApply(); }
    if (msg.type === 'SETTINGS_CHANGED') { settings = await dp.getSettings(); refreshOverlay(true); scanAndApply(); }
    if (msg.type === 'TOGGLE_OVERLAY') { toggleOverlay(!overlayVisible); }
    if (msg.type === 'LOAD_ALL') { void doLoadAll(); }
    if (msg.type === 'AUTH_CHANGED') { signedIn = (await getValidSession()) !== null; }
    if (msg.type === 'VERDICTS_SYNCED') { await loadVerdictCacheFromStorage(); scanAndApply(); }
  });

  processArticles();
}

void init();
