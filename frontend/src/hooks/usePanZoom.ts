import { useCallback, useEffect, useRef, useState } from "react";

interface Transform {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.2;

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function usePanZoom(initial: Transform = { x: 0, y: 0, scale: 1 }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<Transform>(initial);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastMid = useRef<{ x: number; y: number } | null>(null);
  const lastDist = useRef<number | null>(null);
  const dragging = useRef(false);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const originX = clientX - rect.left;
    const originY = clientY - rect.top;

    setTransform((t) => {
      const newScale = clampScale(t.scale * factor);
      const ratio = newScale / t.scale;
      return {
        scale: newScale,
        x: originX - (originX - t.x) * ratio,
        y: originY - (originY - t.y) * ratio,
      };
    });
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0016);
      zoomAt(e.clientX, e.clientY, factor);
    },
    [zoomAt],
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragging.current = true;
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      lastMid.current = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      lastDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      const prev = pointers.current.get(e.pointerId)!;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2) {
        const pts = Array.from(pointers.current.values());
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastDist.current) {
          zoomAt(mid.x, mid.y, dist / lastDist.current);
        }
        if (lastMid.current) {
          setTransform((t) => ({
            ...t,
            x: t.x + (mid.x - lastMid.current!.x),
            y: t.y + (mid.y - lastMid.current!.y),
          }));
        }
        lastMid.current = mid;
        lastDist.current = dist;
        return;
      }

      if (dragging.current && pointers.current.size === 1) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
      }
    },
    [zoomAt],
  );

  const endPointer = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      lastMid.current = null;
      lastDist.current = null;
    }
    if (pointers.current.size === 0) dragging.current = false;
  }, []);

  const zoomIn = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25);
  }, [zoomAt]);

  const zoomOut = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.8);
  }, [zoomAt]);

  const reset = useCallback((t: Transform = initial) => {
    setTransform(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const centerOn = useCallback((worldX: number, worldY: number, scale?: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTransform((t) => {
      const s = scale ?? t.scale;
      return {
        scale: s,
        x: rect.width / 2 - worldX * s,
        y: rect.height / 2 - worldY * s,
      };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventDefault = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchmove", preventDefault, { passive: false });
    return () => el.removeEventListener("touchmove", preventDefault);
  }, []);

  return {
    containerRef,
    transform,
    setTransform,
    handlers: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onPointerLeave: endPointer,
    },
    zoomIn,
    zoomOut,
    reset,
    centerOn,
  };
}
