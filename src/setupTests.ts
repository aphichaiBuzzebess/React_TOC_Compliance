import '@testing-library/jest-dom'

// jsdom has no layout: the app scrolls to the top on route change. (Server tests run without a window.)
if (typeof window !== 'undefined') {
  window.scrollTo = () => {}
  // jsdom has no IntersectionObserver, so "reveal on scroll" would never fire. Treat everything as already in view.
  window.IntersectionObserver = class {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(el: Element) { this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  } as unknown as typeof IntersectionObserver
}
