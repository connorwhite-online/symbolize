import { useState, useCallback, useEffect } from "react";
import DropZone from "./components/DropZone";
import ExportQueue from "./components/ExportQueue";
import ThemeToggle from "./components/ThemeToggle";
import { TooltipProvider } from "./components/Tooltip";
import { useTheme } from "./lib/useTheme";
import {
  parseSvg,
  assignWeights,
  generateTemplate,
  type IconVariant,
  type ExportItem,
} from "./lib/template";
import { loadExports, addExport, removeExport } from "./lib/storage";

function deriveSymbolName(files: File[]): string {
  // Use first filename, strip extension and weight suffixes
  const name = files[0].name
    .replace(/\.svg$/i, "")
    .replace(/[-_](ultralight|thin|light|regular|medium|semibold|bold|heavy|black)$/i, "")
    .replace(/\s+/g, ".");
  return name;
}

export default function App() {
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    setExports(loadExports());
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    setError(null);

    try {
      const contents = await Promise.all(
        files.map(async (f) => ({
          fileName: f.name,
          content: await f.text(),
        }))
      );

      // Parse each SVG
      const parsed = contents.map((c) => {
        const { viewBox, paths, strokeWidth } = parseSvg(c.content);
        return {
          fileName: c.fileName,
          content: c.content,
          viewBox,
          paths,
          strokeWidth,
        };
      });

      // Assign weights (returns primary weight per variant + range coverage)
      const { weights, weightRanges } = assignWeights(
        parsed.map((p) => ({
          strokeWidth: p.strokeWidth,
          fileName: p.fileName,
        }))
      );

      const variants: IconVariant[] = parsed.map((p, i) => ({
        svgContent: p.content,
        viewBox: p.viewBox,
        paths: p.paths,
        weight: weights[i],
        strokeWidth: p.strokeWidth,
        fileName: p.fileName,
      }));

      const symbolName = deriveSymbolName(files);
      const templateSvg = generateTemplate(variants, symbolName, weightRanges);

      const item: ExportItem = {
        id: crypto.randomUUID(),
        name: symbolName,
        variants,
        templateSvg,
        createdAt: Date.now(),
      };

      setExports(addExport(item));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to process SVG");
    }
  }, []);

  const handleRemove = useCallback((id: string) => {
    setExports(removeExport(id));
  }, []);

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-6 py-16 pb-24">
        <header className="mb-8">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Symbolize" className="h-8 w-8" />
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Symbolize
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Convert SVG icons into SF Symbol templates for Xcode. Drop in a
            single icon or multiple weight variants, and we'll detect the weights
            and generate a ready-to-import template.
          </p>
        </header>

        <div className="space-y-8">
          <DropZone onFiles={handleFiles} />

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-5 py-4 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <ExportQueue items={exports} onRemove={handleRemove} />
        </div>
      </div>
      <footer className="fixed bottom-0 left-0 right-0 z-50">
        <div className="h-16 bg-gradient-to-t from-zinc-50 via-zinc-50/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80 pointer-events-none" />
        <div className="bg-zinc-50 dark:bg-zinc-950 pb-5">
          <div className="mx-auto max-w-2xl px-6 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
              Built by{" "}
              <span className="relative group inline-flex items-center">
                <a
                  href="https://x.com/connor_online"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative z-10 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors"
                >
                  Connor
                </a>
                <a
                  href="https://connorwhite.studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-pop-first rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm p-2 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                >
                  <svg className="h-4 w-4 text-zinc-500" viewBox="0 0 24 24" fill="none">
                    <path d="M21 12C21 16.9706 16.9706 21 12 21M21 12C21 7.02944 16.9706 3 12 3M21 12H3M12 21C7.02944 21 3 16.9706 3 12M12 21C9.79086 21 8 16.9706 8 12C8 7.02944 9.79086 3 12 3M12 21C14.2091 21 16 16.9706 16 12C16 7.02944 14.2091 3 12 3M3 12C3 7.02944 7.02944 3 12 3" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
                  </svg>
                </a>
                <a
                  href="https://x.com/connor_online"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-pop-second rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm p-2 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                >
                  <svg className="h-4 w-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.4033 3.5H20.2852L13.989 10.701L21.396 20.5H15.5964L11.054 14.557L5.85637 20.5H2.97269L9.70709 12.7977L2.60156 3.5H8.54839L12.6544 8.93215L17.4033 3.5ZM16.3918 18.7738H17.9887L7.68067 5.13549H5.96702L16.3918 18.7738Z"/>
                  </svg>
                </a>
              </span>
            </span>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>
      </footer>
    </div>
    </TooltipProvider>
  );
}
