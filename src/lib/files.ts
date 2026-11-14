import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export const BUCKET = 'hoh-files';

/** Shrinks phone photos (often 5-12 MB) to a sharp ~1600px JPEG before upload. Other files pass through. */
export async function prepareFile(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    return blob ?? file;
  } catch {
    return file; // e.g. HEIC on a browser that can't decode it: upload as-is
  }
}

function extFor(file: File, blob: Blob) {
  if (blob.type === 'image/jpeg') return 'jpg';
  const fromName = file.name.split('.').pop();
  return fromName && fromName.length <= 5 ? fromName.toLowerCase() : 'bin';
}

/** Uploads a file under `folder/` and returns its storage path. */
export async function uploadFile(folder: string, file: File): Promise<{ path: string; contentType: string }> {
  const blob = await prepareFile(file);
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
  const path = `${folder}/${id}.${extFor(file, blob)}`;
  const contentType = blob.type || file.type || 'application/octet-stream';
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false });
  if (error) throw error;
  return { path, contentType };
}

export async function removeFiles(paths: string[]) {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

const urlCache = new Map<string, { url: string; expires: number }>();

/** Short-lived private link to a stored file (files are never public). */
export function useFileUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => (path && urlCache.get(path)?.url) || null);
  useEffect(() => {
    if (!path) return setUrl(null);
    const cached = urlCache.get(path);
    if (cached && cached.expires > Date.now()) return setUrl(cached.url);
    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (cancelled || !data?.signedUrl) return;
        urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
        setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

export const isPdf = (pathOrType: string | null | undefined) => !!pathOrType && /pdf/i.test(pathOrType);
