/// <reference lib="dom" />
import type { RouteGeometryWorkerRequest, RouteGeometryWorkerResponse } from "@/lib/routeGeometryWorkerTypes";

type Pending = {
  request: RouteGeometryWorkerRequest;
  resolve: (v: Array<[number, number]> | null) => void;
  cleanup: () => void;
  discarded: boolean;
};

/**
 * Single worker, one in-flight job at a time; FIFO queue.
 * invalidateAll() marks queued + inflight as discarded so stale worker responses are ignored safely.
 */
export class RouteGeometryWorkerClient {
  private worker: Worker | null = null;
  private queue: Pending[] = [];
  private inflight: Pending | null = null;

  constructor(workerUrl: URL) {
    try {
      this.worker = new Worker(workerUrl, { type: "module" });
      this.worker.addEventListener("message", (event: MessageEvent<RouteGeometryWorkerResponse>) => {
        this.onMessage(event.data);
      });
    } catch {
      this.worker = null;
    }
  }

  terminate() {
    this.invalidateAll();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /** Drop all pending work; in-flight result will be ignored when it arrives. */
  invalidateAll() {
    for (const p of this.queue) {
      if (!p.discarded) {
        p.discarded = true;
        p.cleanup();
        p.resolve(null);
      }
    }
    this.queue = [];
    if (this.inflight && !this.inflight.discarded) {
      this.inflight.discarded = true;
    }
  }

  private onMessage(msg: RouteGeometryWorkerResponse | undefined) {
    if (!msg || !this.inflight) return;
    const cur = this.inflight;
    const rid = cur.request.payload.routeId;
    if (msg.type === "route-geometry-built") {
      if (msg.payload.routeId !== rid) return;
    } else if (msg.type === "route-geometry-failed") {
      if (msg.routeId !== rid) return;
    } else {
      return;
    }
    this.inflight = null;
    const discarded = cur.discarded;
    cur.cleanup();
    if (discarded) {
      cur.resolve(null);
    } else if (msg.type === "route-geometry-built") {
      cur.resolve(msg.payload.points);
    } else {
      cur.resolve(null);
    }
    this.flush();
  }

  private flush() {
    if (!this.worker || this.inflight) return;
    const next = this.queue.shift();
    if (!next) return;
    if (next.discarded) {
      this.flush();
      return;
    }
    this.inflight = next;
    this.worker.postMessage(next.request);
  }

  requestPoints(request: RouteGeometryWorkerRequest, signal: AbortSignal): Promise<Array<[number, number]> | null> {
    if (!this.worker || signal.aborted) return Promise.resolve(null);
    return new Promise((resolve) => {
      const routeId = request.payload.routeId;
      const onAbort = () => {
        const idx = this.queue.findIndex((p) => p.request.payload.routeId === routeId);
        if (idx >= 0) {
          const [removed] = this.queue.splice(idx, 1);
          if (!removed.discarded) {
            removed.discarded = true;
            removed.cleanup();
            removed.resolve(null);
          }
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });

      const pending: Pending = {
        request,
        discarded: false,
        resolve: (v) => {
          signal.removeEventListener("abort", onAbort);
          resolve(v);
        },
        cleanup: () => {
          signal.removeEventListener("abort", onAbort);
        },
      };

      this.queue.push(pending);
      this.flush();
    });
  }
}
