type Listener = () => void;

/**
 * Minimal, framework-agnostic reactive store. React/Vue/Svelte/etc.
 * wrappers subscribe to this to re-render on state changes, keeping
 * all business logic out of the UI layer.
 */
export class Store<T extends Record<string, unknown>> {
  private state: T;
  private readonly initialState: T;
  private listeners: Set<Listener> = new Set();

  constructor(initialState: T) {
    this.state = initialState;
    this.initialState = initialState;
  }

  getState(): Readonly<T> {
    return this.state;
  }

  setState(partial: Partial<T> | ((prev: T) => Partial<T>)) {
    const patch = typeof partial === "function" ? partial(this.state) : partial;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  select<K>(selector: (state: T) => K): K {
    return selector(this.state);
  }

  reset() {
    this.state = this.initialState;
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
