// Polyfill window.location to prevent Clerk's useAuth() from crashing in React Native
const mockLocation = {
  href: 'http://localhost/',
  origin: 'http://localhost',
  protocol: 'http:',
  host: 'localhost',
  hostname: 'localhost',
  port: '',
  pathname: '/',
  search: '',
  hash: ''
};

if (typeof global !== 'undefined') {
  if (!(global as any).window) {
    (global as any).window = global;
  }
  if (!(global as any).window.location) {
    (global as any).window.location = mockLocation as any;
  }
}
if (typeof window !== 'undefined' && !(window as any).location) {
  (window as any).location = mockLocation as any;
}
