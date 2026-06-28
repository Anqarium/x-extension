import { DataProvider, createChromeBackend } from '../data/data-provider';
import { ReplyCollector } from './collector';
import { SortedOverlay } from './overlay/overlay';
import { injectBlockButton } from './block-injector';
import { applyCollapse } from './collapse';
import { loadAllReplies } from './auto-scroll';
import { sortReplies } from '../core/sort-engine';
import { findReplyArticles } from './adapters/x-selectors';
import { onMessage, broadcast } from '../shared/messaging';
import type { Settings, Lists } from '../core/models';

const dp = new DataProvider(createChromeBackend());
const collector = new ReplyCollector();

let settings: Settings;
let lists: Lists;
let overlay: SortedOverlay | null = null;
let overlayVisible = false;
let loadingAll = false;

function isThreadPage(): boolean {
  return /\/status\/\d+/.test(location.pathname);
}

function refreshOverlay(): void {
  if (!overlay || !overlayVisible) return;
  const sorted = sortReplies(collector.all(), settings.tieBreaker);
  overlay.render(sorted, loadingAll);
}

function mountOverlayIfNeeded(): void {
  if (!isThreadPage() || !overlayVisible) return;
  const firstArticle = document.querySelector<HTMLElement>('article[data-testid="tweet"]');
  if (!firstArticle) return;
  if (!overlay) {
    overlay = new SortedOverlay(settings.animationsEnabled, {
      onLoadAll: () => { void doLoadAll(); },
      onClose: () => toggleOverlay(false)
    });
  }
  overlay.mountBefore(firstArticle);
  refreshOverlay();
}

function toggleOverlay(show: boolean): void {
  overlayVisible = show;
  if (!show) { overlay?.unmount(); return; }
  mountOverlayIfNeeded();
}

async function doLoadAll(): Promise<void> {
  if (loadingAll) return;
  loadingAll = true;
  refreshOverlay();
  await loadAllReplies({
    delayMs: settings.autoScrollDelayMs,
    onStep: () => collector.ingestFrom(document)
  });
  loadingAll = false;
  refreshOverlay();
}

function processArticles(): void {
  collector.ingestFrom(document);
  for (const article of findReplyArticles(document)) {
    injectBlockButton(article, {
      onBlock: async (handle) => {
        await dp.addToBlocklist(handle);
        lists = await dp.getLists();
        broadcast({ type: 'LISTS_CHANGED' });
        scanAndCollapse();
      }
    });
    applyCollapse(article, lists);
  }
  if (overlayVisible) { mountOverlayIfNeeded(); refreshOverlay(); }
}

function scanAndCollapse(): void {
  for (const article of findReplyArticles(document)) applyCollapse(article, lists);
}

async function init(): Promise<void> {
  settings = await dp.getSettings();
  lists = await dp.getLists();
  overlayVisible = settings.overlayEnabledByDefault && isThreadPage();

  const observer = new MutationObserver(() => {
    // X'in re-render'ında sürekli çalışmamak için bir sonraki frame'e ertele
    requestAnimationFrame(processArticles);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  onMessage(async (msg) => {
    if (msg.type === 'LISTS_CHANGED') { lists = await dp.getLists(); scanAndCollapse(); }
    if (msg.type === 'SETTINGS_CHANGED') { settings = await dp.getSettings(); }
    if (msg.type === 'TOGGLE_OVERLAY') { toggleOverlay(!overlayVisible); }
    if (msg.type === 'LOAD_ALL') { void doLoadAll(); }
  });

  processArticles();
}

void init();
