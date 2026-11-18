/** Wraps a callback so it runs at most once (e.g. an undo toast action). */
function once<Args extends unknown[]>(fn: (...args: Args) => void) {
  let done = false;
  return (...args: Args) => {
    if (done) return;
    done = true;
    fn(...args);
  };
}

export { once };
