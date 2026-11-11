// Share a vertical viewport check across rails and their preview warmers.
// An observer rooted in the horizontal rail cannot tell if the rail itself is on screen.
const callbacks = new Map<Element, Set<() => void>>();
let observer: IntersectionObserver | undefined;

export function observeViewportApproach(element: Element, callback: () => void) {
  if (typeof IntersectionObserver === "undefined") {
    callback();
    return () => {};
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      const listeners = callbacks.get(target);
      callbacks.delete(target);
      observer?.unobserve(target);
      listeners?.forEach((notify) => notify());
    }
  }, { rootMargin: "600px 0px" });

  let listeners = callbacks.get(element);
  if (!listeners) {
    listeners = new Set();
    callbacks.set(element, listeners);
    observer.observe(element);
  }
  listeners.add(callback);
  const observed = listeners;
  return () => {
    observed.delete(callback);
    if (observed.size || callbacks.get(element) !== observed) return;
    callbacks.delete(element);
    observer?.unobserve(element);
  };
}
