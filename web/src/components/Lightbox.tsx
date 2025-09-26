// web/src/components/Lightbox.tsx
import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

/** Minimal fullscreen overlay. Closes on click, on Escape, and on background click. */
export default function Lightbox({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-full max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      <button
        aria-label="Close"
        className="absolute top-3 right-3 rounded bg-base-100/90 px-2 py-1 text-xs"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}