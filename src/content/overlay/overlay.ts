import type { ReplyData } from '../../core/models';
import overlayCss from './overlay.css?inline';

const STYLE_ID = 'xcf-overlay-style';

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = overlayCss;
  document.head.appendChild(style);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export interface OverlayCallbacks {
  onLoadAll: () => void;
  onClose: () => void;
}

export class SortedOverlay {
  private root: HTMLElement;
  private cb: OverlayCallbacks;

  constructor(animations: boolean, cb: OverlayCallbacks) {
    this.cb = cb;
    ensureStyle();
    this.root = document.createElement('div');
    this.root.className = 'xcf-overlay' + (animations ? ' xcf-anim' : '');
  }

  mountBefore(anchor: HTMLElement): void {
    if (this.root.isConnected) return;
    anchor.parentElement?.insertBefore(this.root, anchor);
  }

  unmount(): void {
    this.root.remove();
  }

  render(replies: ReplyData[], loading: boolean): void {
    const header = `
      <div class="xcf-overlay__header">
        <span>Beğeniye göre sıralı yorumlar (${replies.length})</span>
        <div class="xcf-overlay__actions">
          <button class="xcf-btn" data-act="loadall" ${loading ? 'disabled' : ''}>
            ${loading ? 'Yükleniyor…' : 'Tümünü yükle ve tam sırala'}
          </button>
          <button class="xcf-btn xcf-btn--ghost" data-act="close">Kapat</button>
        </div>
      </div>`;

    const cards = replies.map(r => `
      <div class="xcf-card">
        <div class="xcf-card__avatar" style="${r.avatarUrl ? `background-image:url(${escapeHtml(r.avatarUrl)});background-size:cover` : ''}"></div>
        <div class="xcf-card__body">
          <div>
            <span class="xcf-card__name">${escapeHtml(r.displayName)}</span>
            <span class="xcf-card__handle">@${escapeHtml(r.handle)}</span>
            <a class="xcf-card__open" href="${escapeHtml(r.permalink)}" target="_blank" rel="noopener">X'te aç</a>
          </div>
          <div class="xcf-card__text">${escapeHtml(r.text)}</div>
          <div class="xcf-card__likes">❤ ${formatCount(r.likes)} · 🔁 ${formatCount(r.reposts)} · 💬 ${formatCount(r.replies)}</div>
        </div>
      </div>`).join('');

    this.root.innerHTML = header + cards;
    this.root.querySelector('[data-act="loadall"]')?.addEventListener('click', () => this.cb.onLoadAll());
    this.root.querySelector('[data-act="close"]')?.addEventListener('click', () => this.cb.onClose());
  }
}
