'use client';

import { useRef, useState, useCallback } from 'react';

export interface DownBadMediaResult {
  mediaUrl: string;
  posterUrl: string | null;
  mediaType: 'photo' | 'video';
}

interface Props {
  onUpload: (result: DownBadMediaResult) => void;
  value?: DownBadMediaResult | null;
  disabled?: boolean;
}

// Extract the first frame of a video as a JPEG blob.
// Resolves to null if the browser can't decode the video in time.
function extractPosterFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const cleanup = () => URL.revokeObjectURL(url);

    const timeout = setTimeout(() => { cleanup(); resolve(null); }, 8000);

    video.onloadeddata = () => {
      video.currentTime = 0;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); resolve(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { cleanup(); resolve(blob); }, 'image/jpeg', 0.85);
      } catch {
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => { clearTimeout(timeout); cleanup(); resolve(null); };
    video.src = url;
    video.load();
  });
}

export default function DownBadMediaUpload({ onUpload, value, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setUploading(true);
    setProgress(5);

    try {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');

      if (!isVideo && !isImage) {
        setError('Photos and videos only — no other file types.');
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError('File too large (max 100 MB).');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      // Extract poster frame for video before uploading
      if (isVideo) {
        setProgress(15);
        const poster = await extractPosterFrame(file);
        if (poster) {
          formData.append('poster', new File([poster], 'poster.jpg', { type: 'image/jpeg' }));
        }
      }

      setProgress(30);

      // XHR for upload progress tracking
      const result = await new Promise<DownBadMediaResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload/down-bad-media');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(30 + Math.round((e.loaded / e.total) * 65));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText) as DownBadMediaResult); }
            catch { reject(new Error('Invalid server response')); }
          } else {
            try {
              const body = JSON.parse(xhr.responseText) as { error?: string };
              reject(new Error(body.error || `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });

      setProgress(100);
      onUpload(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // ── Uploaded state — show preview ─────────────────────────────────────────
  if (value && !uploading) {
    return (
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#111' }}>
        {value.mediaType === 'photo' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.mediaUrl}
            alt="Sum extra"
            style={{ width: '100%', maxHeight: 320, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <video
            src={value.mediaUrl}
            poster={value.posterUrl ?? undefined}
            controls
            playsInline
            style={{ width: '100%', maxHeight: 320, display: 'block', background: '#000' }}
          />
        )}
        {/* Replace button */}
        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              position: 'absolute', bottom: 10, right: 10,
              background: 'rgba(0,0,0,0.7)', color: '#fff',
              fontSize: 12, fontWeight: 600, padding: '6px 14px',
              borderRadius: 100, border: 'none', cursor: 'pointer',
              backdropFilter: 'blur(4px)',
            }}
          >
            Replace
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={handleChange}
        />
      </div>
    );
  }

  // ── Upload zone ────────────────────────────────────────────────────────────
  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => !uploading && !disabled && inputRef.current?.click()}
        style={{
          border: '1.5px dashed #333',
          borderRadius: 12,
          padding: '32px 16px',
          textAlign: 'center',
          cursor: uploading || disabled ? 'default' : 'pointer',
          background: '#0d0d0d',
          transition: 'border-color 0.15s',
        }}
      >
        {uploading ? (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏫</div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 12 }}>Uploading…</div>
            <div style={{
              height: 4, background: '#222', borderRadius: 2, overflow: 'hidden',
              width: '80%', margin: '0 auto',
            }}>
              <div style={{
                height: '100%', background: '#fff',
                width: `${progress}%`,
                borderRadius: 2,
                transition: 'width 0.2s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 8 }}>{progress}%</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
            <div style={{ fontSize: 14, color: '#ddd', fontWeight: 600, marginBottom: 4 }}>
              Add a photo or video
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              Show what the sum extra is — required to post
            </div>
            <div style={{ fontSize: 11, color: '#444', marginTop: 8 }}>
              Tap to choose · or drag &amp; drop · max 100 MB
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#FF8A8A', marginTop: 8 }}>{error}</div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={handleChange}
        disabled={uploading || disabled}
      />
    </div>
  );
}
