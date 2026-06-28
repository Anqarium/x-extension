import type { ReplyData } from '../core/models';
import { findReplyArticles, parseReply } from './adapters/x-selectors';

// Görünen yorumları kararlı id ile biriktirir; kaydırmada kaybolmaz.
export class ReplyCollector {
  private byId = new Map<string, ReplyData>();

  ingestFrom(root: ParentNode): void {
    for (const article of findReplyArticles(root)) {
      const reply = parseReply(article);
      if (reply) this.byId.set(reply.id, reply);
    }
  }

  all(): ReplyData[] {
    return Array.from(this.byId.values());
  }

  count(): number {
    return this.byId.size;
  }

  clear(): void {
    this.byId.clear();
  }
}
