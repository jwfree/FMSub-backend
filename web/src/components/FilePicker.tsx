import { useId, useRef, useState } from "react";

type Props = {
  label?: string;
  accept?: string;
  /** Called with the selected file, or null when cleared */
  onPick: (file: File | null) => void | Promise<void>;
  /** Show an image preview if provided */
  previewUrl?: string | null;
  /** Show chosen file name (you can pass imageFile?.name) */
  fileName?: string | null;
  /** Optional warning/note message to display under the picker */
  warn?: string | null;
  /** Optional helper text to display under the picker */
  note?: string | null;
  disabled?: boolean;
  className?: string;
  /** If provided, sets the native capture attribute for mobile cameras.
   *  e.g. true | "user" | "environment"
   */
  capture?: boolean | "user" | "environment";
  /** Show a clear button that calls onPick(null) */
  allowClear?: boolean;
};

export default function FilePicker({
  label = "Product image",
  accept = "image/*,.heic,.heif",
  onPick,
  previewUrl,
  fileName,
  warn,
  note,
  disabled,
  className = "",
  capture,
  allowClear = true,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function openNativePicker() {
    if (!disabled) inputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    void onPick(f);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f) void onPick(f);
  }

  function prevent(e: React.DragEvent) {
    e.preventDefault();
    if (disabled) return;
    if (e.type === "dragenter" || e.type === "dragover") setIsDragging(true);
    if (e.type === "dragleave") setIsDragging(false);
  }

  return (
    <div className={className}>
      {label && <label className="block text-xs text-base-content/80 mb-1">{label}</label>}

      {/* Hidden native input */}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture as any}
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
      />

      {/* Clickable / droppable surface */}
      <div
        role="button"
        tabIndex={0}
        onClick={openNativePicker}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openNativePicker()}
        onDragEnter={prevent}
        onDragOver={prevent}
        onDragLeave={prevent}
        onDrop={handleDrop}
        className={`w-full sm:w-auto rounded-xl border border-dashed px-4 py-3 text-sm transition
          ${disabled ? "cursor-not-allowed opacity-60 border-base-300 bg-base-100" : "cursor-pointer hover:border-base-400 hover:bg-base-200"}
          ${isDragging ? "border-primary bg-primary/10" : "border-base-300 bg-base-100"}`}
        aria-describedby={`${inputId}-help`}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-base-200">📷</span>
          <span className="truncate">
            {fileName ? "Choose a different image" : "Click or drop to upload image"}
          </span>
        </div>
      </div>

      {/* Filename + preview + actions */}
      <div className="mt-2 flex items-center gap-3">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Preview"
            className="h-24 w-24 rounded object-cover border border-base-300"
          />
        ) : null}

        <div className="text-xs text-base-content/70 flex-1 min-w-0">
          {fileName ? (
            <span>
              Selected: <span className="font-medium truncate inline-block align-bottom max-w-full">{fileName}</span>
            </span>
          ) : (
            "No file selected"
          )}
          {note && <div id={`${inputId}-help`} className="mt-1">{note}</div>}
          {warn && <div className="mt-1 text-error">{warn}</div>}
        </div>

        {allowClear && (fileName || previewUrl) && !disabled && (
          <button
            type="button"
            onClick={() => void onPick(null)}
            className="btn btn-xs btn-outline"
            aria-label="Clear selected image"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}