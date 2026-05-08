import type { ExportItem } from "./template";

const STORAGE_KEY = "symbolize_exports";

export function loadExports(): ExportItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveExports(items: ExportItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addExport(item: ExportItem): ExportItem[] {
  const items = loadExports();
  items.unshift(item);
  saveExports(items);
  return items;
}

export function removeExport(id: string): ExportItem[] {
  const items = loadExports().filter((i) => i.id !== id);
  saveExports(items);
  return items;
}

export function updateExport(id: string, patch: Partial<ExportItem>): ExportItem[] {
  const items = loadExports().map((i) =>
    i.id === id ? { ...i, ...patch } : i
  );
  saveExports(items);
  return items;
}

export function downloadSvg(svgContent: string, filename: string): void {
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
