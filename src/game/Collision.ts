export interface Circle {
  x: number;
  y: number;
  r: number;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.r + b.r;
  return dx * dx + dy * dy < r * r;
}

export function circleRectOverlap(c: Circle, rx: number, ry: number, rw: number, rh: number): boolean {
  const nx = Math.max(rx, Math.min(c.x, rx + rw));
  const ny = Math.max(ry, Math.min(c.y, ry + rh));
  const dx = c.x - nx;
  const dy = c.y - ny;
  return dx * dx + dy * dy < c.r * c.r;
}
