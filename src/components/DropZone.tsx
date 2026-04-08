import { useState, useCallback, useRef } from "react";
import UploadIcon from "../icons/UploadIcon";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
}

export default function DropZone({ onFiles }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type === "image/svg+xml" || f.name.endsWith(".svg")
      );
      if (files.length > 0) onFiles(files);
    },
    [onFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) onFiles(files);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFiles]
  );

  return (
    <div
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative cursor-pointer rounded-2xl border-2 border-dashed p-8
        transition-[border-color,transform] duration-200 text-center
        ${
          isDragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950 scale-[1.01]"
            : "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-2">
        <UploadIcon className={`h-8 w-8 transition-colors ${isDragging ? "text-blue-500" : "text-zinc-400"}`} />
        <div>
          <p className={`text-sm font-medium ${isDragging ? "text-blue-600" : "text-zinc-700 dark:text-zinc-300"}`}>
            {isDragging ? "Drop SVGs here" : "Drop SVG icons here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            One icon for all weights, or multiple variants for weight detection
          </p>
        </div>
      </div>
    </div>
  );
}
