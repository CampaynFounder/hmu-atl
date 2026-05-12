'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BlastPhotoClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('That doesn\'t look like a photo. Pick a JPG or PNG.');
      return;
    }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('video', file); // /api/upload/video accepts both photos and videos
      fd.set('profile_type', 'rider');
      fd.set('media_type', 'photo');
      fd.set('save_to_profile', 'true');
      const res = await fetch('/api/upload/video', { method: 'POST', body: fd });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        setError(body.error || 'Upload failed. Try again.');
        setUploading(false);
        return;
      }
      // Photo's saved on rider_profiles.avatar_url. Bounce back to the form;
      // the API will re-check and let the blast through.
      router.push('/rider/blast/new');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setUploading(false);
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8 flex flex-col">
      <div className="mt-4">
        <h1 className="text-xl font-bold">One more thing — your photo</h1>
        <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
          Drivers want to know who they&rsquo;re picking up. Snap a quick photo —
          this is a safety thing.
        </p>
      </div>

      <div className="mt-6 flex-1 flex items-center justify-center">
        <div className="w-48 h-48 rounded-full bg-neutral-900 border-2 border-dashed border-neutral-700 overflow-hidden flex items-center justify-center">
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="text-neutral-600 text-5xl">📷</div>
          )}
        </div>
      </div>

      {error && <div className="text-center text-sm text-red-400 mb-3">{error}</div>}

      <div className="space-y-2 pb-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full bg-white text-black font-bold py-4 rounded-2xl text-base disabled:bg-neutral-800 disabled:text-neutral-500 transition-colors"
        >
          {uploading ? 'Uploading…' : 'Take or choose photo'}
        </button>
      </div>
    </div>
  );
}
