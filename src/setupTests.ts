import '@testing-library/jest-dom'

// jsdom has no layout: the app scrolls to the top on route change. (Server tests run without a window.)
if (typeof window !== 'undefined') window.scrollTo = () => {}
