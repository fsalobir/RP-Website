type TaskFn<T> = (signal: AbortSignal) => Promise<T>;

export class MapScheduler {
  private currentController: AbortController | null = null;

  async runLatest<T>(task: TaskFn<T>): Promise<T> {
    if (this.currentController) this.currentController.abort();
    const controller = new AbortController();
    this.currentController = controller;
    try {
      return await task(controller.signal);
    } finally {
      if (this.currentController === controller) this.currentController = null;
    }
  }

  cancel() {
    if (this.currentController) this.currentController.abort();
    this.currentController = null;
  }
}

