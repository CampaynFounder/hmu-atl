'use client';

import { useRef, useState } from 'react';

interface Props {
  photoUrl: string;
  onUploaded: (url: string) => void;
  onUploadStateChange?: (uploading: boolean) => void;
}

export function AdPhotoStep({ photoUrl, onUploaded, onUploadStateChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    onUploadStateChange?.(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('profile_type', 'driver');
      formData.append('media_type', 'photo');
      formData.append('save_to_profile', 'false');

      const res = await fetch('/api/upload/video', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Upload failed'); return; }
      onUploaded(data.url);
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      onUploadStateChange?.(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
        <div className="flex gap-3">
          <span className="text-xl mt-0.5">{'📸'}</span>
          <div className="text-sm text-zinc-400">
            <strong className="text-zinc-200">This shows on your HMU link.</strong>{' '}
            Vehicle photo, promo card, flyer — whatever gets riders to book you.
          </div>
        </div>
      </div>

      {uploading && (
        <div className="rounded-xl border-2 border-[#00E676]/30 bg-zinc-900 p-6 text-center">
          <div style={{ width: 24, height: 24, border: '2px solid #00E676', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
          <div className="text-sm text-[#00E676] font-semibold">Uploading photo...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {photoUrl && !uploading ? (
        <div className="space-y-3">
          <div className="rounded-xl overflow-hidden border border-zinc-700">
            <img src={photoUrl} alt="Your ad" style={{ width: '100%', display: 'block' }} />
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-xl border-2 border-dashed border-zinc-600 px-4 py-3 text-sm text-zinc-400 hover:border-[#00E676] hover:text-[#00E676] transition-all"
          >
            {uploading ? 'Uploading...' : 'Change Photo'}
          </button>
        </div>
      ) : !uploading ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-xl border-2 border-dashed border-zinc-600 px-6 py-10 text-center hover:border-[#00E676] transition-all"
        >
          <div className="text-3xl mb-2">{'📷'}</div>
          <div className="text-sm font-semibold text-white mb-1">
            {uploading ? 'Uploading...' : 'Tap to upload a photo'}
          </div>
          <div className="text-xs text-zinc-400">
            Vehicle photo, promo card, or advertisement
          </div>
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />

      {error && (
        <div className="rounded-xl bg-red-950 border border-red-800 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
