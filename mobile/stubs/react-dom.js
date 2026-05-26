// React Native stub for react-dom — Clerk's web dependency imports this
// but only uses it for portal rendering which never runs on native.
module.exports = {
  createPortal: (children) => children,
  findDOMNode: () => null,
  render: () => null,
  unmountComponentAtNode: () => false,
  flushSync: (fn) => fn(),
};
