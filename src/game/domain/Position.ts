/**
 * Grid coordinates. Purely logical: no pixel/world concepts live here.
 * x = column (increases EAST), y = row (increases SOUTH).
 */
export interface Position {
  readonly x: number;
  readonly y: number;
}

export function pos(x: number, y: number): Position {
  return { x, y };
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function translate(p: Position, delta: Position): Position {
  return { x: p.x + delta.x, y: p.y + delta.y };
}
