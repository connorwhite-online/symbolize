import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_ADJUSTMENTS,
  type ExportItem,
  type IconVariant,
  type SymbolAdjustments,
} from "../lib/template";

interface TweakDialogProps {
  item: ExportItem;
  onClose: () => void;
  onSave: (adjustments: SymbolAdjustments) => void;
}

const PREVIEW_W = 360;
const PREVIEW_H = 220;
// Cap height region inside the preview (in preview pixels)
const PREVIEW_BASELINE = 150;
const PREVIEW_CAP_HEIGHT = 88;
const PREVIEW_CAPLINE = PREVIEW_BASELINE - PREVIEW_CAP_HEIGHT;
const SYMBOL_TO_CAP_HEIGHT_RATIO = 1.4;

function pickRegularVariant(variants: IconVariant[]): IconVariant {
  return (
    variants.find((v) => v.weight === "Regular") ??
    variants[Math.floor(variants.length / 2)] ??
    variants[0]
  );
}

export default function TweakDialog({ item, onClose, onSave }: TweakDialogProps) {
  const initial = item.adjustments ?? DEFAULT_ADJUSTMENTS;
  const [scale, setScale] = useState(initial.scale);
  const [offsetX, setOffsetX] = useState(initial.offsetX);
  const [offsetY, setOffsetY] = useState(initial.offsetY);
  const [busy, setBusy] = useState(false);

  const variant = useMemo(() => pickRegularVariant(item.variants), [item.variants]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Preview transform: mirror the same math used by generateTemplate so what
  // the user sees here matches the exported template.
  const previewTransform = useMemo(() => {
    const vb = variant.viewBox;
    const aspect = vb.width / vb.height;
    const targetH = PREVIEW_CAP_HEIGHT * SYMBOL_TO_CAP_HEIGHT_RATIO * scale;
    const targetW = targetH * aspect;
    const sx = targetW / vb.width;
    const sy = targetH / vb.height;
    const centerY = PREVIEW_BASELINE - PREVIEW_CAP_HEIGHT / 2;
    const tx = PREVIEW_W / 2 - targetW / 2 - vb.x * sx + offsetX * sx;
    const ty = centerY - targetH / 2 - vb.y * sy + offsetY * sy;
    return { sx, sy, tx, ty };
  }, [variant, scale, offsetX, offsetY]);

  const reset = () => {
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const opticalCenter = async () => {
    setBusy(true);
    try {
      const result = await computeOpticalOffsets(variant);
      if (result) {
        setOffsetX(result.offsetX);
        setOffsetY(result.offsetY);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    onSave({ scale, offsetX, offsetY });
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Adjust ${item.name}`}
    >
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Adjust {item.name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Scale and nudge the symbol within the cap-height guides. Applies to all weights and scales.
          </p>
        </div>

        <div className="px-5 pb-4">
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <svg
              viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
              className="w-full h-auto block"
            >
              {/* Capline + baseline */}
              <line
                x1={20}
                x2={PREVIEW_W - 20}
                y1={PREVIEW_CAPLINE}
                y2={PREVIEW_CAPLINE}
                stroke="#27AAE1"
                strokeWidth={0.5}
                strokeDasharray="2 2"
              />
              <line
                x1={20}
                x2={PREVIEW_W - 20}
                y1={PREVIEW_BASELINE}
                y2={PREVIEW_BASELINE}
                stroke="#27AAE1"
                strokeWidth={0.5}
                strokeDasharray="2 2"
              />
              <text
                x={24}
                y={PREVIEW_CAPLINE - 4}
                fontSize={9}
                fill="#27AAE1"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                Capline
              </text>
              <text
                x={24}
                y={PREVIEW_BASELINE + 11}
                fontSize={9}
                fill="#27AAE1"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                Baseline
              </text>
              {/* Symbol */}
              <g
                transform={`matrix(${previewTransform.sx} 0 0 ${previewTransform.sy} ${previewTransform.tx} ${previewTransform.ty})`}
                dangerouslySetInnerHTML={{ __html: variant.paths }}
              />
            </svg>
          </div>
        </div>

        <div className="px-5 pb-4 space-y-3">
          <Slider
            label="Scale"
            value={scale}
            min={0.5}
            max={1.6}
            step={0.01}
            display={`${scale.toFixed(2)}×`}
            onChange={setScale}
          />
          <Slider
            label="Offset X"
            value={offsetX}
            min={-6}
            max={6}
            step={0.05}
            display={offsetX.toFixed(2)}
            onChange={setOffsetX}
          />
          <Slider
            label="Offset Y"
            value={offsetY}
            min={-6}
            max={6}
            step={0.05}
            display={offsetY.toFixed(2)}
            onChange={setOffsetY}
          />
        </div>

        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={opticalCenter}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? "Centering…" : "Optical center"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
          >
            Reset
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-16 text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-zinc-900 dark:accent-zinc-100 cursor-pointer"
      />
      <span className="w-12 tabular-nums text-right text-zinc-700 dark:text-zinc-300">
        {display}
      </span>
    </label>
  );
}

/**
 * Compute offsets that move the icon's visual centroid (alpha-weighted) onto
 * the geometric center of its tight bounding box. Returns offsets in viewBox
 * units, ready to be applied as adjustments.
 */
async function computeOpticalOffsets(
  variant: IconVariant
): Promise<{ offsetX: number; offsetY: number } | null> {
  const SIZE = 256;
  const vb = variant.viewBox;
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" width="${SIZE}" height="${SIZE}">${variant.paths}</svg>`;
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg image load failed"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

    let sumX = 0;
    let sumY = 0;
    let totalA = 0;
    let minX = SIZE;
    let maxX = -1;
    let minY = SIZE;
    let maxY = -1;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const a = data[(y * SIZE + x) * 4 + 3];
        if (a > 0) {
          sumX += x * a;
          sumY += y * a;
          totalA += a;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (totalA === 0 || maxX < 0) return null;

    const centroidX = sumX / totalA;
    const centroidY = sumY / totalA;
    const bboxCenterX = (minX + maxX) / 2;
    const bboxCenterY = (minY + maxY) / 2;

    // Shift in canvas pixels so centroid lands on bbox center
    const dxPx = bboxCenterX - centroidX;
    const dyPx = bboxCenterY - centroidY;

    // Convert to viewBox units
    const offsetX = (dxPx * vb.width) / SIZE;
    const offsetY = (dyPx * vb.height) / SIZE;

    return { offsetX, offsetY };
  } catch (e) {
    console.warn("Optical-center computation failed:", e);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
