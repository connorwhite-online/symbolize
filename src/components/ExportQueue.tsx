import type { ExportItem } from "../lib/template";
import { downloadSvg } from "../lib/storage";
import { Tooltip } from "./Tooltip";
import FileIcon from "../icons/FileIcon";
import DownloadIcon from "../icons/DownloadIcon";
import DeleteIcon from "../icons/DeleteIcon";

interface ExportQueueProps {
  items: ExportItem[];
  onRemove: (id: string) => void;
}

export default function ExportQueue({ items, onRemove }: ExportQueueProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
        Exports
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 shadow-sm"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <FileIcon className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {item.name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {item.variants.length} variant{item.variants.length !== 1 ? "s" : ""} &middot;{" "}
                  {new Date(item.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 ml-4">
              <Tooltip content="Download">
                <button
                  onClick={() => downloadSvg(item.templateSvg, `${item.name}.svg`)}
                  className="rounded-lg p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <DownloadIcon className="h-5 w-5" />
                </button>
              </Tooltip>
              <Tooltip content="Delete">
                <button
                  onClick={() => onRemove(item.id)}
                  className="rounded-lg p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors cursor-pointer"
                >
                  <DeleteIcon className="h-5 w-5" />
                </button>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
