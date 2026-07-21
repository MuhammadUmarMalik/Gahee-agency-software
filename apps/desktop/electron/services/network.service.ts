import { net } from "electron";

export class NetworkService {
  isOnline() {
    return net.isOnline();
  }

  async canReach(url: string, timeoutMs = 8_000) {
    if (!this.isOnline()) return false;
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      return response.status > 0;
    } catch {
      return false;
    }
  }
}
