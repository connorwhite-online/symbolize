/**
 * Stroke-to-outline conversion using paper.js
 *
 * SF Symbols requires all artwork to be filled outline paths, not stroked paths.
 * This module converts stroked SVG paths into filled outlines.
 */

import paper from "paper";
import { PaperOffset } from "paperjs-offset";

let initialized = false;

function ensureSetup() {
  if (initialized) return;
  // paper.js needs a canvas element in browser environments
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;
  paper.setup(canvas);
  initialized = true;
}

/**
 * Convert an SVG string with stroked paths into one with filled outline paths.
 * Returns the new inner SVG content (paths/groups) ready for template insertion.
 */
export function convertStrokesToOutlines(svgString: string): {
  paths: string;
  viewBox: { x: number; y: number; width: number; height: number };
} {
  ensureSetup();
  paper.project.clear();

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) throw new Error("Invalid SVG");

  // Parse viewBox
  const vb = svg.getAttribute("viewBox");
  let viewBox = { x: 0, y: 0, width: 24, height: 24 };
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    viewBox = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  } else {
    const w = parseFloat(svg.getAttribute("width") || "24");
    const h = parseFloat(svg.getAttribute("height") || "24");
    viewBox = { x: 0, y: 0, width: w, height: h };
  }

  // Collect inherited presentation attributes from the <svg> root
  const rootFill = svg.getAttribute("fill");
  const rootStroke = svg.getAttribute("stroke");
  const rootStrokeWidth = svg.getAttribute("stroke-width");
  const rootStrokeCap = svg.getAttribute("stroke-linecap");
  const rootStrokeJoin = svg.getAttribute("stroke-linejoin");

  // Process all path elements
  const outlinePaths: string[] = [];
  const pathElements = svg.querySelectorAll("path, line, circle, rect, ellipse, polygon, polyline");

  pathElements.forEach((el) => {
    const result = convertElement(el, {
      rootFill,
      rootStroke,
      rootStrokeWidth,
      rootStrokeCap,
      rootStrokeJoin,
    });
    if (result) outlinePaths.push(result);
  });

  const paths = outlinePaths.join("\n");
  return { paths, viewBox };
}

interface InheritedAttrs {
  rootFill: string | null;
  rootStroke: string | null;
  rootStrokeWidth: string | null;
  rootStrokeCap: string | null;
  rootStrokeJoin: string | null;
}

function resolveAttr(
  el: Element,
  attr: string,
  inherited: string | null
): string | null {
  // Check element attribute
  const val = el.getAttribute(attr);
  if (val) return val;

  // Check inline style
  const style = el.getAttribute("style");
  if (style) {
    const match = style.match(new RegExp(`${attr}:\\s*([^;]+)`));
    if (match) return match[1].trim();
  }

  // Check parent groups
  let parent = el.parentElement;
  while (parent && parent.tagName !== "svg") {
    const pVal = parent.getAttribute(attr);
    if (pVal) return pVal;
    const pStyle = parent.getAttribute("style");
    if (pStyle) {
      const match = pStyle.match(new RegExp(`${attr}:\\s*([^;]+)`));
      if (match) return match[1].trim();
    }
    parent = parent.parentElement;
  }

  // Fall back to inherited from root <svg>
  return inherited;
}

function convertElement(
  el: Element,
  inherited: InheritedAttrs
): string | null {
  const fill = resolveAttr(el, "fill", inherited.rootFill);
  const stroke = resolveAttr(el, "stroke", inherited.rootStroke);
  const strokeWidthStr = resolveAttr(
    el,
    "stroke-width",
    inherited.rootStrokeWidth
  );
  const strokeCap = resolveAttr(
    el,
    "stroke-linecap",
    inherited.rootStrokeCap
  );
  const strokeJoin = resolveAttr(
    el,
    "stroke-linejoin",
    inherited.rootStrokeJoin
  );
  const fillRule = resolveAttr(el, "fill-rule", null);

  // SVG default stroke-width is 1 when stroke is present but no width specified
  const resolvedStrokeWidth = strokeWidthStr ? parseFloat(strokeWidthStr) : 1;
  const hasStroke =
    stroke && stroke !== "none" && resolvedStrokeWidth > 0;
  const hasFill = fill && fill !== "none";
  const isNoFill = fill === "none" || (!fill && !hasFill);

  // Get path data string
  let pathData = getPathData(el);
  if (!pathData) return null;

  // SF Symbols' compiler ignores fill-rule="evenodd" and uses non-zero winding.
  // Rewrite the subpaths so cutouts work under non-zero rendering.
  if (fillRule === "evenodd") {
    const reoriented = reorientForNonZero(pathData);
    if (reoriented) pathData = reoriented;
  }

  const results: string[] = [];

  if (hasStroke && isNoFill) {
    // Stroke-only path: convert stroke to filled outline
    const outlined = strokeToOutline(
      pathData,
      resolvedStrokeWidth,
      strokeCap || "butt",
      strokeJoin || "miter"
    );
    if (outlined) {
      results.push(`<path d="${outlined}" fill="black" stroke="none"/>`);
    }
  } else if (hasStroke && hasFill) {
    // Both fill and stroke: output fill path + stroke outline
    results.push(`<path d="${pathData}" fill="black" stroke="none"/>`);
    const outlined = strokeToOutline(
      pathData,
      resolvedStrokeWidth,
      strokeCap || "butt",
      strokeJoin || "miter"
    );
    if (outlined) {
      results.push(`<path d="${outlined}" fill="black" stroke="none"/>`);
    }
  } else if (hasFill) {
    // Fill-only path: keep as-is but normalize to black
    results.push(`<path d="${pathData}" fill="black" stroke="none"/>`);
  }

  return results.length > 0 ? results.join("\n") : null;
}

// SF Symbols' template compiler ignores fill-rule="evenodd" and renders with
// non-zero winding. To preserve cutouts (e.g., the hole inside a frame), reverse
// the winding of any subpath that is contained inside another so the inner and
// outer wind in opposite directions.
function reorientForNonZero(pathData: string): string | null {
  try {
    paper.project.clear();
    const compound = new paper.CompoundPath({ pathData, insert: false });
    const children =
      compound.children.length > 0
        ? (compound.children.slice() as paper.Path[])
        : [compound as unknown as paper.Path];

    for (const child of children) {
      const isInside = children.some(
        (other) =>
          other !== child &&
          other.bounds.contains(child.bounds) &&
          other.bounds.area > child.bounds.area
      );
      const path = child as paper.Path;
      if (isInside && path.clockwise) path.reverse();
      else if (!isInside && !path.clockwise) path.reverse();
    }

    const result = compound.pathData;
    paper.project.clear();
    return result;
  } catch (e) {
    console.warn("Even-odd to non-zero conversion failed:", e);
    return null;
  }
}

function getPathData(el: Element): string | null {
  const tag = el.tagName.toLowerCase();

  if (tag === "path") {
    return el.getAttribute("d");
  }

  if (tag === "line") {
    const x1 = el.getAttribute("x1") || "0";
    const y1 = el.getAttribute("y1") || "0";
    const x2 = el.getAttribute("x2") || "0";
    const y2 = el.getAttribute("y2") || "0";
    return `M${x1},${y1}L${x2},${y2}`;
  }

  if (tag === "rect") {
    const x = parseFloat(el.getAttribute("x") || "0");
    const y = parseFloat(el.getAttribute("y") || "0");
    const w = parseFloat(el.getAttribute("width") || "0");
    const h = parseFloat(el.getAttribute("height") || "0");
    const rx = parseFloat(el.getAttribute("rx") || "0");
    const ry = parseFloat(el.getAttribute("ry") || el.getAttribute("rx") || "0");
    if (rx === 0 && ry === 0) {
      return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
    }
    return `M${x + rx},${y}H${x + w - rx}Q${x + w},${y},${x + w},${y + ry}V${y + h - ry}Q${x + w},${y + h},${x + w - rx},${y + h}H${x + rx}Q${x},${y + h},${x},${y + h - ry}V${y + ry}Q${x},${y},${x + rx},${y}Z`;
  }

  if (tag === "circle") {
    const cx = parseFloat(el.getAttribute("cx") || "0");
    const cy = parseFloat(el.getAttribute("cy") || "0");
    const r = parseFloat(el.getAttribute("r") || "0");
    return `M${cx - r},${cy}A${r},${r},0,1,0,${cx + r},${cy}A${r},${r},0,1,0,${cx - r},${cy}Z`;
  }

  if (tag === "ellipse") {
    const cx = parseFloat(el.getAttribute("cx") || "0");
    const cy = parseFloat(el.getAttribute("cy") || "0");
    const rx = parseFloat(el.getAttribute("rx") || "0");
    const ry = parseFloat(el.getAttribute("ry") || "0");
    return `M${cx - rx},${cy}A${rx},${ry},0,1,0,${cx + rx},${cy}A${rx},${ry},0,1,0,${cx - rx},${cy}Z`;
  }

  if (tag === "polygon" || tag === "polyline") {
    const points = el.getAttribute("points");
    if (!points) return null;
    const pts = points.trim().split(/[\s,]+/);
    let d = `M${pts[0]},${pts[1]}`;
    for (let i = 2; i < pts.length; i += 2) {
      d += `L${pts[i]},${pts[i + 1]}`;
    }
    if (tag === "polygon") d += "Z";
    return d;
  }

  return null;
}

function strokeToOutline(
  pathData: string,
  strokeWidth: number,
  strokeCap: string,
  strokeJoin: string
): string | null {
  try {
    paper.project.clear();

    // Import the path
    const path = new paper.CompoundPath(pathData);
    path.strokeWidth = strokeWidth;
    path.strokeCap = strokeCap as "round" | "square" | "butt";
    path.strokeJoin = strokeJoin as "round" | "bevel" | "miter";

    // Use PaperOffset to create stroke outline
    const offset = strokeWidth / 2;
    const capNormalized = strokeCap === "square" ? "butt" : (strokeCap as "round" | "butt");
    const outlined = PaperOffset.offsetStroke(path, offset, {
      cap: capNormalized,
      join: strokeJoin as "round" | "bevel" | "miter",
    });

    if (!outlined) return null;

    // Export as SVG path data
    const result = outlined.pathData;
    paper.project.clear();
    return result;
  } catch (e) {
    console.warn("Stroke-to-outline conversion failed:", e);
    return null;
  }
}
