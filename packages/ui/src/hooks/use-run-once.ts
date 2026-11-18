import * as React from "react";

/** Returns a factory that wraps callbacks so each runs at most once (e.g. an undo toast action). */
function useRunOnce() {
  return React.useCallback(<Args extends unknown[]>(fn: (...args: Args) => void) => {
    let done = false;
    return (...args: Args) => {
      if (done) return;
      done = true;
      fn(...args);
    };
  }, []);
}

export { useRunOnce };
