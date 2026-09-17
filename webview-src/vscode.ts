// Singleton wrapper for acquireVsCodeApi
// Safely handles environments where the API is unavailable (e.g., local dev)

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
};

const api =
  typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

export function postMessage(msg: unknown): void {
  api?.postMessage(msg);
}

export function getState<T>(): T | undefined {
  return api?.getState<T>();
}

export function setState<T>(state: T): void {
  api?.setState(state);
}
