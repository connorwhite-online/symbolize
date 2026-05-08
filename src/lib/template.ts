/**
 * SF Symbol Template Engine
 *
 * Generates SF Symbol template SVGs from user-provided icon SVGs.
 * Based on the Apple SF Symbol template v7.0 format (3300x2200 viewBox).
 */

import { convertStrokesToOutlines } from "./outline";

export const WEIGHTS = [
  "Ultralight",
  "Thin",
  "Light",
  "Regular",
  "Medium",
  "Semibold",
  "Bold",
  "Heavy",
  "Black",
] as const;

export type Weight = (typeof WEIGHTS)[number];

export const SCALES = ["S", "M", "L"] as const;
export type Scale = (typeof SCALES)[number];

// Column center X positions for each weight (from the template header labels)
const WEIGHT_CENTER_X: Record<Weight, number> = {
  Ultralight: 559.711,
  Thin: 856.422,
  Light: 1153.13,
  Regular: 1449.84,
  Medium: 1746.56,
  Semibold: 2043.27,
  Bold: 2339.98,
  Heavy: 2636.69,
  Black: 2933.4,
};

// Baseline Y and Capline Y for each scale
const SCALE_GUIDES: Record<Scale, { baseline: number; capline: number }> = {
  S: { baseline: 696, capline: 625.541 },
  M: { baseline: 1126, capline: 1055.54 },
  L: { baseline: 1556, capline: 1485.54 },
};

// The "cap height" in template units for each scale
function capHeight(scale: Scale): number {
  const g = SCALE_GUIDES[scale];
  return g.baseline - g.capline;
}

// Scale factors relative to Small
const SCALE_FACTORS: Record<Scale, number> = {
  S: 1.0,
  M: 1.0, // same cap height in template
  L: 1.0,
};

// Apple's SF Symbols typically render at ~1.4x cap height so the glyph
// overshoots the baseline/capline guides. Sizing strictly to cap height (1.0x)
// makes user-imported symbols look about half the visual weight of stock ones.
const SYMBOL_TO_CAP_HEIGHT_RATIO = 1.4;

// Margin half-width per weight (derived from template; wider symbols get more margin)
// We'll use a fixed small margin and center the icon in the column
export interface IconVariant {
  svgContent: string; // the raw SVG content
  viewBox: { x: number; y: number; width: number; height: number };
  paths: string; // inner SVG elements (paths, groups, etc.)
  weight: Weight;
  strokeWidth: number;
  fileName: string;
}

export interface ExportItem {
  id: string;
  name: string;
  variants: IconVariant[];
  templateSvg: string;
  createdAt: number;
}

/**
 * Parse an SVG string and extract its viewBox + inner path content.
 * Stroked paths are converted to filled outlines (required by SF Symbols).
 */
export function parseSvg(svgString: string): {
  viewBox: { x: number; y: number; width: number; height: number };
  paths: string;
  strokeWidth: number;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) throw new Error("Invalid SVG");

  // Detect stroke widths (before conversion, for weight detection)
  const strokeWidth = detectStrokeWidth(svg);

  // Convert strokes to filled outlines using paper.js
  // SF Symbols expects filled outline paths, not stroked paths
  const { paths, viewBox } = convertStrokesToOutlines(svgString);

  return { viewBox, paths, strokeWidth };
}

/**
 * Detect the predominant stroke-width in an SVG element
 */
function detectStrokeWidth(svg: Element): number {
  const strokeWidths: number[] = [];

  // Check inline stroke-width attributes
  const allElements = svg.querySelectorAll("*");
  allElements.forEach((el) => {
    const sw = el.getAttribute("stroke-width");
    if (sw) strokeWidths.push(parseFloat(sw));

    const style = el.getAttribute("style");
    if (style) {
      const match = style.match(/stroke-width:\s*([\d.]+)/);
      if (match) strokeWidths.push(parseFloat(match[1]));
    }
  });

  // Check SVG root style attribute too
  const rootStyle = svg.getAttribute("style");
  if (rootStyle) {
    const match = rootStyle.match(/stroke-width:\s*([\d.]+)/);
    if (match) strokeWidths.push(parseFloat(match[1]));
  }

  // If elements have a stroke but no explicit stroke-width, default to 1 (SVG spec)
  if (strokeWidths.length === 0) {
    const hasAnyStroke = Array.from(svg.querySelectorAll("*")).some((el) => {
      const s = el.getAttribute("stroke");
      return s && s !== "none";
    });
    return hasAnyStroke ? 1 : 0;
  }

  // Return the average/predominant stroke width
  return strokeWidths.reduce((a, b) => a + b, 0) / strokeWidths.length;
}

/**
 * Guess weight from filename conventions
 */
export function guessWeightFromFilename(filename: string): Weight | null {
  const lower = filename.toLowerCase();
  const map: [RegExp, Weight][] = [
    [/ultralight|ultra[-_]?light/i, "Ultralight"],
    [/\bthin\b/i, "Thin"],
    [/\blight\b/i, "Light"],
    [/\bregular\b/i, "Regular"],
    [/\bmedium\b/i, "Medium"],
    [/semi[-_]?bold/i, "Semibold"],
    [/\bbold\b/i, "Bold"],
    [/\bheavy\b/i, "Heavy"],
    [/\bblack\b/i, "Black"],
  ];

  for (const [re, weight] of map) {
    if (re.test(lower)) return weight;
  }
  return null;
}

/**
 * Assign each variant a primary weight AND a range of weights it should cover.
 * Returns one entry per variant with the primary weight used for the variant object,
 * plus a weightRanges map used by the template generator.
 */
export function assignWeights(
  variants: { strokeWidth: number; fileName: string }[]
): { weights: Weight[]; weightRanges: Map<Weight, Weight[]> } {
  if (variants.length === 1) {
    // Single icon covers all 9 weights
    const allWeights = [...WEIGHTS];
    const rangeMap = new Map<Weight, Weight[]>();
    rangeMap.set("Regular", allWeights);
    return { weights: ["Regular"], weightRanges: rangeMap };
  }

  // First try filename-based assignment
  const filenameWeights = variants.map((v) =>
    guessWeightFromFilename(v.fileName)
  );
  if (filenameWeights.every((w) => w !== null)) {
    const fWeights = filenameWeights as Weight[];
    const rangeMap = buildWeightRanges(fWeights);
    return { weights: fWeights, weightRanges: rangeMap };
  }

  // Sort by stroke width ascending (thinnest = lightest weight)
  const indexed = variants.map((v, i) => ({ ...v, originalIndex: i }));
  const sorted = [...indexed].sort((a, b) => a.strokeWidth - b.strokeWidth);

  // Distribute N variants evenly across 9 weight slots
  const ranges = distributeToWeightRanges(sorted.length);

  // Build result preserving original order
  const result: Weight[] = new Array(variants.length);
  const rangeMap = new Map<Weight, Weight[]>();

  sorted.forEach((v, sortedIdx) => {
    const range = ranges[sortedIdx];
    const primaryWeight = range.primary;
    result[v.originalIndex] = primaryWeight;
    rangeMap.set(primaryWeight, range.covers);
  });

  return { weights: result, weightRanges: rangeMap };
}

/**
 * Distribute N variants into contiguous ranges across 9 weight slots.
 * Splits evenly: 3 variants → [Ultralight,Thin,Light], [Regular,Medium,Semibold], [Bold,Heavy,Black]
 * 2 variants → [Ultralight..Medium], [Semibold..Black], etc.
 */
function distributeToWeightRanges(
  count: number
): { primary: Weight; covers: Weight[] }[] {
  if (count >= 9) {
    return WEIGHTS.map((w) => ({ primary: w, covers: [w] }));
  }

  // Split 9 weight slots into `count` contiguous chunks
  const chunkSize = Math.floor(9 / count);
  const remainder = 9 % count;
  const ranges: { primary: Weight; covers: Weight[] }[] = [];
  let idx = 0;

  for (let i = 0; i < count; i++) {
    // Distribute remainder slots to earlier chunks so they're even
    const size = chunkSize + (i < remainder ? 1 : 0);
    const covers = WEIGHTS.slice(idx, idx + size) as Weight[];
    // Primary is the middle weight of the chunk
    const primaryIdx = idx + Math.floor((size - 1) / 2);
    ranges.push({
      primary: WEIGHTS[primaryIdx],
      covers: [...covers],
    });
    idx += size;
  }

  return ranges;
}

/**
 * Build weight ranges for filename-assigned weights.
 * Each assigned weight gets the nearest unassigned weights.
 */
function buildWeightRanges(assigned: Weight[]): Map<Weight, Weight[]> {
  const sortedAssigned = [...assigned].sort(
    (a, b) => WEIGHTS.indexOf(a) - WEIGHTS.indexOf(b)
  );
  const primaryIndices = sortedAssigned.map((w) => WEIGHTS.indexOf(w));

  // Split at midpoints between primaries
  const rangeMap = new Map<Weight, Weight[]>();
  for (let i = 0; i < primaryIndices.length; i++) {
    const start = i === 0
      ? 0
      : Math.ceil((primaryIndices[i - 1] + primaryIndices[i]) / 2);
    const end = i === primaryIndices.length - 1
      ? 8
      : Math.floor((primaryIndices[i] + primaryIndices[i + 1]) / 2);
    const covers: Weight[] = [];
    for (let j = start; j <= end; j++) {
      covers.push(WEIGHTS[j]);
    }
    rangeMap.set(sortedAssigned[i], covers);
  }
  return rangeMap;
}

/**
 * Generate the full SF Symbol template SVG with icons placed in the grid
 */
export function generateTemplate(
  variants: IconVariant[],
  symbolName: string,
  weightRanges: Map<Weight, Weight[]>
): string {
  // Build a lookup: for every weight slot, find which variant covers it
  const weightToVariant = new Map<Weight, IconVariant>();
  const variantByPrimary = new Map<Weight, IconVariant>();
  for (const v of variants) {
    variantByPrimary.set(v.weight, v);
  }

  // Use weight ranges to map every slot to its variant
  for (const [primary, covers] of weightRanges) {
    const variant = variantByPrimary.get(primary);
    if (!variant) continue;
    for (const w of covers) {
      weightToVariant.set(w, variant);
    }
  }

  // Fallback: if any weight is still unassigned, use nearest
  const resolveVariant = (weight: Weight): IconVariant => {
    if (weightToVariant.has(weight)) return weightToVariant.get(weight)!;

    const idx = WEIGHTS.indexOf(weight);
    let best: IconVariant | null = null;
    let bestDist = Infinity;
    for (const [w, v] of variantByPrimary) {
      const dist = Math.abs(WEIGHTS.indexOf(w) - idx);
      if (dist < bestDist) {
        bestDist = dist;
        best = v;
      }
    }
    return best!;
  };

  let symbolGroups = "";
  let marginGuides = "";

  for (const weight of WEIGHTS) {
    const variant = resolveVariant(weight);
    if (!variant) continue;

    for (const scale of SCALES) {
      const { baseline } = SCALE_GUIDES[scale];
      const ch = capHeight(scale);
      const sf = SCALE_FACTORS[scale];

      // Size the icon to ~1.4x cap height to match Apple's stock SF Symbols.
      const vb = variant.viewBox;
      const iconAspect = vb.width / vb.height;
      const targetHeight = ch * sf * SYMBOL_TO_CAP_HEIGHT_RATIO;
      const targetWidth = targetHeight * iconAspect;

      // Center horizontally on the weight column
      const centerX = WEIGHT_CENTER_X[weight];
      const leftX = centerX - targetWidth / 2;

      const scaleX = targetWidth / vb.width;
      const scaleY = targetHeight / vb.height;

      // Center the (oversized) icon vertically on the cap-height region so it
      // overshoots above capline and below baseline by equal amounts.
      const capHeightCenterY = baseline - ch / 2;
      const translateX = leftX - vb.x * scaleX;
      const translateY = capHeightCenterY - targetHeight / 2 - vb.y * scaleY;

      symbolGroups += `  <g id="${weight}-${scale}" transform="matrix(${scaleX.toFixed(6)} 0 0 ${scaleY.toFixed(6)} ${translateX.toFixed(3)} ${translateY.toFixed(3)})">\n`;
      symbolGroups += `   ${variant.paths}\n`;
      symbolGroups += `  </g>\n`;

      // Add margin guides for every weight-scale combination
      const margin = 4; // small margin in template units
      const leftMargin = leftX - margin;
      const rightMargin = leftX + targetWidth + margin;
      const guideTop = SCALE_GUIDES[scale].capline - 25;
      const guideBottom = SCALE_GUIDES[scale].baseline + 25;
      marginGuides += `  <line id="left-margin-${weight}-${scale}" style="fill:none;stroke:#00AEEF;stroke-width:0.5;opacity:1.0;" x1="${leftMargin.toFixed(3)}" x2="${leftMargin.toFixed(3)}" y1="${guideTop.toFixed(3)}" y2="${guideBottom.toFixed(3)}"/>\n`;
      marginGuides += `  <line id="right-margin-${weight}-${scale}" style="fill:none;stroke:#00AEEF;stroke-width:0.5;opacity:1.0;" x1="${rightMargin.toFixed(3)}" x2="${rightMargin.toFixed(3)}" y1="${guideTop.toFixed(3)}" y2="${guideBottom.toFixed(3)}"/>\n`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--Generator: Symbolize-->
<!DOCTYPE svg
PUBLIC "-//W3C//DTD SVG 1.1//EN"
       "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 3300 2200">
 <!--glyph: "custom", point size: 100.0, template writer version: "Symbolize 1.0"-->
 <style>.SFSymbolsPreviewWireframe {fill:none;opacity:1.0;stroke:black;stroke-width:0.5}
</style>
 <g id="Notes">
  <rect height="2200" id="artboard" style="fill:white;opacity:1" width="3300" x="0" y="0"/>
  <line style="fill:none;stroke:black;opacity:1;stroke-width:0.5;" x1="263" x2="3036" y1="292" y2="292"/>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;font-weight:bold;" transform="matrix(1 0 0 1 263 322)">Weight/Scale Variations</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:middle;" transform="matrix(1 0 0 1 559.711 322)">Ultralight</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:middle;" transform="matrix(1 0 0 1 856.422 322)">Thin</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:middle;" transform="matrix(1 0 0 1 1153.13 322)">Light</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:middle;" transform="matrix(1 0 0 1 1449.84 322)">Regular</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:middle;" transform="matrix(1 0 0 1 1746.56 322)">Medium</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:middle;" transform="matrix(1 0 0 1 2043.27 322)">Semibold</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:middle;" transform="matrix(1 0 0 1 2339.98 322)">Bold</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:middle;" transform="matrix(1 0 0 1 2636.69 322)">Heavy</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:middle;" transform="matrix(1 0 0 1 2933.4 322)">Black</text>
  <line style="fill:none;stroke:black;opacity:1;stroke-width:0.5;" x1="263" x2="3036" y1="1903" y2="1903"/>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;font-weight:bold;" transform="matrix(1 0 0 1 263 1953)">Design Variations</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;" transform="matrix(1 0 0 1 263 1971)">Symbols are supported in up to nine weights and three scales.</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;" transform="matrix(1 0 0 1 263 1989)">For optimal layout with text and other symbols, vertically align</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;" transform="matrix(1 0 0 1 263 2007)">symbols with the adjacent text.</text>
  <text id="template-version" style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:end;" transform="matrix(1 0 0 1 3036 1933)">Template v.7.0</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:end;" transform="matrix(1 0 0 1 3036 1951)">Requires Xcode 26 or greater</text>
  <text id="descriptive-name" style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:end;" transform="matrix(1 0 0 1 3036 1969)">Generated from ${symbolName}</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;text-anchor:end;" transform="matrix(1 0 0 1 3036 1987)">Typeset at 100.0 points</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;" transform="matrix(1 0 0 1 263 726)">Small</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;" transform="matrix(1 0 0 1 263 1156)">Medium</text>
  <text style="stroke:none;fill:black;font-family:sans-serif;font-size:13;" transform="matrix(1 0 0 1 263 1586)">Large</text>
 </g>
 <g id="Guides">
  <g id="H-reference" style="fill:#27AAE1;stroke:none;" transform="matrix(1 0 0 1 339 696)">
   <path d="M0.993654 0L3.63775 0L29.3281-67.1323L30.0303-67.1323L30.0303-70.459L28.1226-70.459ZM11.6885-24.4799L46.9815-24.4799L46.2315-26.7285L12.4385-26.7285ZM55.1196 0L57.7637 0L30.6382-70.459L29.4326-70.459L29.4326-67.1323Z"/>
  </g>
  <line id="Baseline-S" style="fill:none;stroke:#27AAE1;opacity:1;stroke-width:0.5;" x1="263" x2="3036" y1="696" y2="696"/>
  <line id="Capline-S" style="fill:none;stroke:#27AAE1;opacity:1;stroke-width:0.5;" x1="263" x2="3036" y1="625.541" y2="625.541"/>
  <g id="H-reference" style="fill:#27AAE1;stroke:none;" transform="matrix(1 0 0 1 339 1126)">
   <path d="M0.993654 0L3.63775 0L29.3281-67.1323L30.0303-67.1323L30.0303-70.459L28.1226-70.459ZM11.6885-24.4799L46.9815-24.4799L46.2315-26.7285L12.4385-26.7285ZM55.1196 0L57.7637 0L30.6382-70.459L29.4326-70.459L29.4326-67.1323Z"/>
  </g>
  <line id="Baseline-M" style="fill:none;stroke:#27AAE1;opacity:1;stroke-width:0.5;" x1="263" x2="3036" y1="1126" y2="1126"/>
  <line id="Capline-M" style="fill:none;stroke:#27AAE1;opacity:1;stroke-width:0.5;" x1="263" x2="3036" y1="1055.54" y2="1055.54"/>
  <g id="H-reference" style="fill:#27AAE1;stroke:none;" transform="matrix(1 0 0 1 339 1556)">
   <path d="M0.993654 0L3.63775 0L29.3281-67.1323L30.0303-67.1323L30.0303-70.459L28.1226-70.459ZM11.6885-24.4799L46.9815-24.4799L46.2315-26.7285L12.4385-26.7285ZM55.1196 0L57.7637 0L30.6382-70.459L29.4326-70.459L29.4326-67.1323Z"/>
  </g>
  <line id="Baseline-L" style="fill:none;stroke:#27AAE1;opacity:1;stroke-width:0.5;" x1="263" x2="3036" y1="1556" y2="1556"/>
  <line id="Capline-L" style="fill:none;stroke:#27AAE1;opacity:1;stroke-width:0.5;" x1="263" x2="3036" y1="1485.54" y2="1485.54"/>
${marginGuides} </g>
 <g id="Symbols">
${symbolGroups} </g>
</svg>
`;
}
