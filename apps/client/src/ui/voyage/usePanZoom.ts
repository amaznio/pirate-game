import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** Where the map sits in its viewport: the world's top left corner in pixels, and how much it is magnified. */
export interface MapView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MapBounds {
  readonly viewW: number;
  readonly viewH: number;
  readonly worldW: number;
  readonly worldH: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** How far past the world's edge the map may be dragged, in pixels. */
  readonly slack: number;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * Keeps a view inside what makes sense: the zoom within its limits, and the world never dragged so far that
 * none of it is on screen (a world smaller than the viewport is kept centred).
 */
export function clampView(view: MapView, bounds: MapBounds): MapView {
  const z = clamp(view.z, bounds.minZoom, bounds.maxZoom);
  const span = (viewSize: number, worldSize: number, at: number): number => {
    const size = worldSize * z;
    if (size + 2 * bounds.slack <= viewSize) {
      return (viewSize - size) / 2;
    }
    return clamp(at, viewSize - size - bounds.slack, bounds.slack);
  };
  return { z, x: span(bounds.viewW, bounds.worldW, view.x), y: span(bounds.viewH, bounds.worldH, view.y) };
}

/** Zooms by a factor about a point of the viewport, so the world point under it stays put. */
export function zoomAround(view: MapView, factor: number, px: number, py: number, bounds: MapBounds): MapView {
  const z = clamp(view.z * factor, bounds.minZoom, bounds.maxZoom);
  const ratio = z / view.z;
  return clampView({ z, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio }, bounds);
}

/** The view that puts a world point at a place in the viewport (as a fraction of its size, from the top left). */
export function viewCentredOn(
  worldX: number,
  worldY: number,
  z: number,
  atX: number,
  atY: number,
  bounds: MapBounds,
): MapView {
  return clampView({ z, x: bounds.viewW * atX - worldX * z, y: bounds.viewH * atY - worldY * z }, bounds);
}

const DRAG_START = 5;
const DEFAULT_LIMITS = { minZoom: 0.6, maxZoom: 2.4, slack: 80 } as const;

/**
 * Pan and zoom for a map you drag around: drag to pan (mouse or touch), wheel or pinch to zoom, with the
 * world kept in bounds. A press that moves less than a few pixels is a click, left to the stops under it;
 * one that moves further is a drag, and the click that follows it is swallowed. The world is moved with a
 * CSS transform, so what is on it stays real elements.
 */
export function usePanZoom(
  viewportRef: RefObject<HTMLDivElement | null>,
  world: { readonly width: number; readonly height: number },
  limits: { readonly minZoom: number; readonly maxZoom: number; readonly slack: number } = DEFAULT_LIMITS,
) {
  const [view, setViewState] = useState<MapView>({ x: 0, y: 0, z: 1 });
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; view: MapView; moved: boolean; pinch?: { distance: number; z: number } } | null>(null);
  const swallowClick = useRef(false);

  const boundsNow = useCallback((): MapBounds => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      viewW: rect?.width ?? world.width,
      viewH: rect?.height ?? world.height,
      worldW: world.width,
      worldH: world.height,
      ...limits,
    };
  }, [viewportRef, world.width, world.height, limits]);

  const setView = useCallback((next: MapView) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  /** Puts a world point at a fraction of the viewport. */
  const centreOn = useCallback(
    (worldX: number, worldY: number, z: number | null, atX = 0.5, atY = 0.4) => {
      setView(viewCentredOn(worldX, worldY, z ?? viewRef.current.z, atX, atY, boundsNow()));
    },
    [boundsNow, setView],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const bounds = boundsNow();
      setView(zoomAround(viewRef.current, factor, bounds.viewW / 2, bounds.viewH / 2, bounds));
    },
    [boundsNow, setView],
  );

  // The wheel zooms about the pointer. It needs a listener that may cancel the page scroll, which React's does not allow.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return undefined;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const bounds = boundsNow();
      setView(zoomAround(viewRef.current, Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top, bounds));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [viewportRef, boundsNow, setView]);

  // A focused stop that is off screen would make the browser scroll the viewport itself: the world moves by transform, so undo that.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return undefined;
    }
    const onScroll = () => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    };
    element.addEventListener('scroll', onScroll);
    return () => element.removeEventListener('scroll', onScroll);
  }, [viewportRef]);

  /** Brings an element of the world into view if it is outside (used when a stop takes keyboard focus). */
  const reveal = useCallback(
    (target: Element) => {
      const element = viewportRef.current;
      if (!element) {
        return;
      }
      const box = element.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const margin = 24;
      const dx = rect.left < box.left + margin ? box.left + margin - rect.left : rect.right > box.right - margin ? box.right - margin - rect.right : 0;
      const dy = rect.top < box.top + margin ? box.top + margin - rect.top : rect.bottom > box.bottom - margin ? box.bottom - margin - rect.bottom : 0;
      if (dx !== 0 || dy !== 0) {
        const v = viewRef.current;
        setView(clampView({ ...v, x: v.x + dx, y: v.y + dy }, boundsNow()));
      }
    },
    [viewportRef, boundsNow, setView],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    swallowClick.current = false;
    if (pointers.current.size === 1) {
      gesture.current = { startX: event.clientX, startY: event.clientY, view: viewRef.current, moved: false };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        startX: event.clientX,
        startY: event.clientY,
        view: viewRef.current,
        moved: true,
        pinch: { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, z: viewRef.current.z },
      };
      setDragging(true);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) {
      return;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const state = gesture.current;
    const bounds = boundsNow();
    if (state.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = viewportRef.current?.getBoundingClientRect();
      const midX = (a!.x + b!.x) / 2 - (rect?.left ?? 0);
      const midY = (a!.y + b!.y) / 2 - (rect?.top ?? 0);
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
      setView(zoomAround(viewRef.current, (state.pinch.z * (distance / state.pinch.distance)) / viewRef.current.z, midX, midY, bounds));
      swallowClick.current = true;
      return;
    }
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) > DRAG_START) {
      state.moved = true;
      setDragging(true);
      // From here the pointer belongs to the drag, so it keeps working outside the viewport.
      viewportRef.current?.setPointerCapture(event.pointerId);
    }
    if (state.moved) {
      swallowClick.current = true;
      setView(clampView({ ...state.view, x: state.view.x + dx, y: state.view.y + dy }, bounds));
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setDragging(false);
    } else if (pointers.current.size === 1) {
      // One finger left after a pinch: carry on panning from where it is.
      const [only] = [...pointers.current.values()];
      gesture.current = { startX: only!.x, startY: only!.y, view: viewRef.current, moved: true };
    }
  };

  /** Swallows the click that ends a drag, so dragging across a stop does not sail there. */
  const onClickCapture = (event: React.MouseEvent) => {
    if (swallowClick.current) {
      event.stopPropagation();
      event.preventDefault();
      swallowClick.current = false;
    }
  };

  return {
    view,
    dragging,
    setView,
    centreOn,
    zoomBy,
    reveal,
    boundsNow,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onClickCapture },
  };
}
