import { DurableObject } from "cloudflare:workers";

const LIMIT = 20;
const WINDOW_MS = 60_000;

interface Window {
  start: number;
  count: number;
}

/** 依 IP 一實例的固定視窗限流:每分鐘 20 次寫入。 */
export class RateLimiter extends DurableObject {
  async checkLimit(now: number = Date.now()): Promise<boolean> {
    const start = now - (now % WINDOW_MS);
    const window = await this.ctx.storage.get<Window>("window");
    if (!window || window.start !== start) {
      await this.ctx.storage.put("window", { start, count: 1 });
      return true;
    }
    if (window.count >= LIMIT) return false;
    await this.ctx.storage.put("window", { start, count: window.count + 1 });
    return true;
  }
}
