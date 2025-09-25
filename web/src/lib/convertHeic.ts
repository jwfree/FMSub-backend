// web/src/lib/convertHeic.ts
// Utilities to accept any image (including HEIC/HEIF), convert to JPEG,
// optionally downscale, and return a preview URL + warning if oversized.

import heic2any from "heic2any";

export type EnsureJpegOptions = {
  quality?: number;   // 0..1 for JPEG encode (default 0.9)
  maxWidth?: number;  // optional scale limit
  maxHeight?: number; // optional scale limit
  maxSizeMB?: number; // show warning if final blob > this (MB)
};

export type EnsureJpegResult = {
  file: File;            // final JPEG file
  previewUrl: string;    // object URL to display preview
  warning?: string;      // e.g., "Image is larger than 8 MB"
};

const isHeicLike = (f: File) => {
  const t = (f.type || "").toLowerCase();
  const n = (f.name || "").toLowerCase();
  return (
    t === "image/heic" ||
    t === "image/heif" ||
    n.endsWith(".heic") ||
    n.endsWith(".heif")
  );
};

function readBlobAsImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function drawScaledToCanvas(
  img: HTMLImageElement,
  maxWidth?: number,
  maxHeight?: number
): HTMLCanvasElement {
  const cw = img.naturalWidth || img.width;
  const ch = img.naturalHeight || img.height;

  if (!maxWidth && !maxHeight) {
    // no scaling requested, draw 1:1
    const c0 = document.createElement("canvas");
    c0.width = cw;
    c0.height = ch;
    const ctx0 = c0.getContext("2d");
    if (!ctx0) return c0;
    ctx0.drawImage(img, 0, 0, cw, ch);
    return c0;
  }

  // compute scale preserving aspect
  let scale = 1;
  if (maxWidth && cw > maxWidth) scale = Math.min(scale, maxWidth / cw);
  if (maxHeight && ch > maxHeight) scale = Math.min(scale, maxHeight / ch);

  if (scale >= 1) {
    // no downsizing needed
    const c0 = document.createElement("canvas");
    c0.width = cw;
    c0.height = ch;
    const ctx0 = c0.getContext("2d");
    if (!ctx0) return c0;
    ctx0.drawImage(img, 0, 0, cw, ch);
    return c0;
  }

  const tw = Math.max(1, Math.round(cw * scale));
  const th = Math.max(1, Math.round(ch * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0, tw, th);
  return canvas;
}

async function blobToJpegFile(
  blob: Blob,
  fileNameBase: string,
  quality = 0.9,
  maxWidth?: number,
  maxHeight?: number
): Promise<File> {
  // Load to <img>, draw (optionally scaled) to canvas, then export JPEG
  const img = await readBlobAsImage(blob);
  const canvas = drawScaledToCanvas(img, maxWidth, maxHeight);

  const jpegBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))),
      "image/jpeg",
      quality
    );
  });

  return new File([jpegBlob], `${fileNameBase}.jpg`, { type: "image/jpeg" });
}

/**
 * Convert any image file to JPEG (HEIC/HEIF supported), optionally downscale,
 * and return the JPEG File + preview URL + size warning if over maxSizeMB.
 */
export async function ensureJpeg(
  file: File,
  opts: EnsureJpegOptions = {}
): Promise<EnsureJpegResult> {
  const {
    quality = 0.9,
    maxWidth,
    maxHeight,
    maxSizeMB,
  } = opts;

  let jpegFile: File;

  try {
    if (isHeicLike(file)) {
      // 1) Convert HEIC/HEIF -> JPEG blob (no resize in heic2any options; we'll handle resize)
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality,
      });
      const blob = Array.isArray(converted) ? converted[0] : (converted as Blob);
      // 2) Re-draw to canvas for optional downscale & consistent encode
      jpegFile = await blobToJpegFile(blob, file.name.replace(/\.[^.]+$/, "") || "image", quality, maxWidth, maxHeight);
    } else {
      // Non-HEIC input: re-encode to JPEG (and optionally downscale)
      jpegFile = await blobToJpegFile(file, file.name.replace(/\.[^.]+$/, "") || "image", quality, maxWidth, maxHeight);
    }
  } catch (err) {
    // As a last resort, return the original file with a preview, but warn.
    const fallbackUrl = URL.createObjectURL(file);
    return {
      file,
      previewUrl: fallbackUrl,
      warning: "Could not convert image; using original file.",
    };
  }

  const previewUrl = URL.createObjectURL(jpegFile);

  let warning: string | undefined;
  if (typeof maxSizeMB === "number" && maxSizeMB > 0) {
    const mb = jpegFile.size / (1024 * 1024);
    if (mb > maxSizeMB) {
      warning = `Image is ${mb.toFixed(1)} MB (over ${maxSizeMB} MB).`;
    }
  }

  return { file: jpegFile, previewUrl, warning };
}