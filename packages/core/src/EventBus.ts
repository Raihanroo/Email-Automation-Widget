export type EventHandler<T = unknown> = (payload: T) => void;

/**
 * Simple pub/sub bus shared across the widget so framework wrappers,
 * the web component, and the core SDK can communicate without a
 * direct dependency on one another.
 */
export class EventBus {
  private events: Map<string, EventHandler[]> = new Map();

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(handler as EventHandler);
    return () => this.off(event, handler as EventHandler);
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const wrapped: EventHandler<T> = (payload) => {
      this.off(event, wrapped as EventHandler);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  emit<T = unknown>(event: string, payload?: T) {
    this.events
      .get(event)
      ?.slice()
      .forEach((handler) => handler(payload));
  }

  off(event: string, handler: EventHandler) {
    const handlers = this.events.get(event);
    if (handlers) {
      this.events.set(
        event,
        handlers.filter((h) => h !== handler)
      );
    }
  }

  clear(event?: string) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  listenerCount(event: string): number {
    return this.events.get(event)?.length ?? 0;
  }
}
