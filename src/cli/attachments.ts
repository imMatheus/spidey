/**
 * Image attachments come from the browser as base64 data. We materialise them
 * into a per-job temp dir under the user's repo so both Claude Code and Codex
 * can see them via their image-aware Read / vision tools, and so they show up
 * in any future audit of what context the agent had.
 *
 * The directory lives at `<cwd>/.spidey-sense/uploads/<jobId>/` — inside the
 * repo so relative paths work out of the box, but namespaced under a hidden
 * folder we recommend gitignoring.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import type { ImageAttachment } from "../protocol";

export interface PreparedAttachment {
  /** Absolute path on disk. */
  absPath: string;
  /** Repo-relative path for printing in the prompt. */
  relPath: string;
  mimeType: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/avif": ".avif",
};

export function prepareAttachments(
  cwd: string,
  jobId: string,
  images: ImageAttachment[] | undefined,
): PreparedAttachment[] {
  if (!images || images.length === 0) return [];
  const baseDir = resolve(cwd, ".spidey-sense", "uploads", jobId);
  mkdirSync(baseDir, { recursive: true });

  const out: PreparedAttachment[] = [];
  let i = 0;
  for (const img of images) {
    if (!img?.dataBase64 || !img?.mimeType) continue;
    if (!img.mimeType.startsWith("image/")) continue;

    // Reject anything that looks weird in the name; we only use it to derive
    // the extension. Untrusted input — never join it as a path component.
    const ext =
      MIME_EXTENSIONS[img.mimeType] ||
      safeExt(img.name) ||
      ".png";

    const filename = `image-${String(i + 1).padStart(2, "0")}${ext}`;
    const absPath = resolve(baseDir, filename);
    try {
      writeFileSync(absPath, Buffer.from(img.dataBase64, "base64"));
    } catch (err) {
      // skip files that can't be written; the prompt will still go through.
      continue;
    }

    out.push({
      absPath,
      relPath: `.spidey-sense/uploads/${jobId}/${filename}`,
      mimeType: img.mimeType,
    });
    i += 1;
  }

  return out;
}

function safeExt(name: string | undefined): string | null {
  if (!name) return null;
  const ext = extname(name).toLowerCase();
  if (!/^\.[a-z0-9]{1,6}$/.test(ext)) return null;
  return ext;
}
