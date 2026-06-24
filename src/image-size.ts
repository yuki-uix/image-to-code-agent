import { extname } from "node:path";

export type ImageSize = { width: number; height: number };

export function detectImageSize(bytes: Buffer, pathOrExtension: string): ImageSize | undefined {
  const extension = normalizeExtension(pathOrExtension);
  return detectPngSize(bytes, extension)
    ?? detectJpegSize(bytes, extension)
    ?? detectWebpSize(bytes, extension)
    ?? detectSvgSize(bytes, extension)
    ?? detectPngSize(bytes)
    ?? detectJpegSize(bytes)
    ?? detectWebpSize(bytes)
    ?? detectSvgSize(bytes);
}

export function detectImageMimeType(bytes: Buffer, pathOrExtension?: string): string {
  const extension = normalizeExtension(pathOrExtension ?? "");
  if (detectPngSize(bytes, extension) ?? detectPngSize(bytes)) return "image/png";
  if (detectJpegSize(bytes, extension) ?? detectJpegSize(bytes)) return "image/jpeg";
  if (detectWebpSize(bytes, extension) ?? detectWebpSize(bytes)) return "image/webp";
  if (detectSvgSize(bytes, extension) ?? detectSvgSize(bytes)) return "image/svg+xml";
  return mimeTypeFromExtension(extension);
}

function detectPngSize(bytes: Buffer, extension?: string): ImageSize | undefined {
  if (extension && extension !== ".png") return undefined;
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") return undefined;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function detectJpegSize(bytes: Buffer, extension?: string): ImageSize | undefined {
  if (extension && ![".jpg", ".jpeg"].includes(extension)) return undefined;
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) return undefined;
    if (isSofMarker(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + segmentLength;
  }
  return undefined;
}

function detectWebpSize(bytes: Buffer, extension?: string): ImageSize | undefined {
  if (extension && extension !== ".webp") return undefined;
  if (bytes.length < 30) return undefined;
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return undefined;
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3)
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }
  return undefined;
}

function detectSvgSize(bytes: Buffer, extension?: string): ImageSize | undefined {
  if (extension && extension !== ".svg") return undefined;
  const source = bytes.toString("utf8", 0, Math.min(bytes.length, 4096));
  if (!source.includes("<svg")) return undefined;
  const width = Number(source.match(/\bwidth=["']([\d.]+)/)?.[1]);
  const height = Number(source.match(/\bheight=["']([\d.]+)/)?.[1]);
  if (Number.isFinite(width) && Number.isFinite(height)) return { width, height };
  const viewBox = source.match(/\bviewBox=["'][^"']*?([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)["']/);
  if (viewBox) {
    const vbWidth = Number(viewBox[3]);
    const vbHeight = Number(viewBox[4]);
    if (Number.isFinite(vbWidth) && Number.isFinite(vbHeight)) return { width: vbWidth, height: vbHeight };
  }
  return undefined;
}

function normalizeExtension(pathOrExtension: string): string {
  return (pathOrExtension.startsWith(".") ? pathOrExtension : extname(pathOrExtension)).toLowerCase();
}

function isSofMarker(marker: number): boolean {
  return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
}

function mimeTypeFromExtension(extension: string): string {
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}
