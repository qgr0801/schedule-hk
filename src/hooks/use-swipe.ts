import { useRef } from "react";

/** Horizontal finger swipe (≥60px, mostly sideways) → onPrev (swipe right) / onNext (swipe left). */
export function useSwipe(onPrev: () => void, onNext: () => void) {
  const p = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      p.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = p.current;
      const t = e.changedTouches[0];
      p.current = null;
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx > 0) onPrev();
      else onNext();
    },
  };
}
