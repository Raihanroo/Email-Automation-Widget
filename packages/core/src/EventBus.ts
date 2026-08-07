type EventHandler = (payload: any) => void;

export class EventBus {
  private events: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)?.push(handler);
  }

  emit(event: string, payload?: any) {
    this.events.get(event)?.forEach((handler) => handler(payload));
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
}
