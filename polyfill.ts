// Polyfill window.location to prevent Clerk's useAuth() from crashing in React Native
if (typeof global !== 'undefined') {
  if (!(global as any).window) {
    (global as any).window = global;
  }
  if (!(global as any).window.location) {
    (global as any).window.location = { href: 'http://localhost' } as any;
  }
}
if (typeof window !== 'undefined' && !(window as any).location) {
  (window as any).location = { href: 'http://localhost' } as any;
}
