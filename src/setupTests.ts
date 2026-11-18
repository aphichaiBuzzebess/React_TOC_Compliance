import '@testing-library/jest-dom'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

class DOMMatrixReadOnlyStub {
  m22: number
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1]
    this.m22 = scale !== undefined ? +scale : 1
  }
}
globalThis.DOMMatrixReadOnly ??= DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly

Object.defineProperties(globalThis.HTMLElement.prototype, {
  offsetHeight: { get(this: HTMLElement) { return parseFloat(this.style.height) || 1 } },
  offsetWidth: { get(this: HTMLElement) { return parseFloat(this.style.width) || 1 } },
})

// Tests run with reduced motion ON so count-ups/progress show final values immediately.
// Other media queries (e.g. min-width) do not match. Individual tests may override with vi.spyOn.
window.matchMedia ??= ((query: string) => ({
  matches: query.includes('prefers-reduced-motion'),
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
