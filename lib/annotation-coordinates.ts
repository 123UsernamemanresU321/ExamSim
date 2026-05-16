export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type Rect = Point & Size;

export function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function clampNormalized(point: Point): Point {
  return {
    x: clampUnit(point.x),
    y: clampUnit(point.y),
  };
}

export function screenToNormalized(point: Point, viewport: Size): Point {
  return clampNormalized({
    x: viewport.width > 0 ? point.x / viewport.width : 0,
    y: viewport.height > 0 ? point.y / viewport.height : 0,
  });
}

export function normalizedToScreen(point: Point, viewport: Size): Point {
  return {
    x: roundPixel(clampUnit(point.x) * viewport.width),
    y: roundPixel(clampUnit(point.y) * viewport.height),
  };
}

export function screenRectToNormalized(rect: Rect, viewport: Size): Rect {
  const normalizedStart = screenToNormalized({ x: rect.x, y: rect.y }, viewport);
  const normalizedEnd = screenToNormalized({ x: rect.x + rect.width, y: rect.y + rect.height }, viewport);
  const x = Math.min(normalizedStart.x, normalizedEnd.x);
  const y = Math.min(normalizedStart.y, normalizedEnd.y);
  return {
    x: roundUnit(x),
    y: roundUnit(y),
    width: roundUnit(Math.max(0, Math.abs(normalizedEnd.x - normalizedStart.x))),
    height: roundUnit(Math.max(0, Math.abs(normalizedEnd.y - normalizedStart.y))),
  };
}

export function normalizedRectToScreen(rect: Rect, viewport: Size): Rect {
  return {
    x: roundPixel(clampUnit(rect.x) * viewport.width),
    y: roundPixel(clampUnit(rect.y) * viewport.height),
    width: roundPixel(Math.max(0, rect.width) * viewport.width),
    height: roundPixel(Math.max(0, rect.height) * viewport.height),
  };
}

export function normalizedToPdf(point: Point, pdfPageDimensions: Size): Point {
  return {
    x: roundPdf(clampUnit(point.x) * pdfPageDimensions.width),
    y: roundPdf(pdfPageDimensions.height - clampUnit(point.y) * pdfPageDimensions.height),
  };
}

export function pdfToNormalized(point: Point, pdfPageDimensions: Size): Point {
  return clampNormalized({
    x: pdfPageDimensions.width > 0 ? roundUnit(point.x / pdfPageDimensions.width) : 0,
    y: pdfPageDimensions.height > 0 ? roundUnit(1 - point.y / pdfPageDimensions.height) : 0,
  });
}

function roundPixel(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundPdf(value: number) {
  return Math.round(value * 100) / 100;
}

function roundUnit(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
