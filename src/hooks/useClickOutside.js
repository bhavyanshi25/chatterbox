import { useEffect, useEffectEvent } from 'react';

// Calls `handler` when a mousedown/touchstart happens outside the element in `ref`.
// Pass `enabled = false` to skip attaching listeners while a popup is closed.
// Wrap the trigger button and the popup in the same ref'd element so clicking
// the trigger doesn't count as "outside".
export function useClickOutside(ref, handler, enabled = true) {
  const onOutside = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) return;

    function listener(e) {
      const el = ref.current;
      if (!el || el.contains(e.target)) return;
      onOutside(e);
    }

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener, { passive: true });
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, enabled]);
}
