// Providers are functions so denied browser storage can be caught by each caller.
export function createStorage(localProvider, sessionProvider, demo = false) {
  return {
    getItem(key) {
      return demo ? sessionProvider().getItem(`demo.${key}`) : localProvider().getItem(key);
    },
    setItem(key, value) {
      if (demo) sessionProvider().setItem(`demo.${key}`, value);
      else localProvider().setItem(key, value);
    }
  };
}
