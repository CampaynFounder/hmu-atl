'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

/* ─── Chapter definitions (mirrors pitch-client.tsx) ─── */

type ChapterSlot = {
  id: string;
  section: string;
  title: string;
  kicker: string;
};

const CHAPTER_SLOTS: ChapterSlot[] = [
  // Driver
  { id: 'driver-onboarding', section: 'DRIVER', title: 'Sign Up & Set Up', kicker: 'Onboarding' },
  { id: 'driver-go-live', section: 'DRIVER', title: 'Go Live & Share Link', kicker: 'Go Live' },
  { id: 'driver-accept-pullup', section: 'DRIVER', title: 'Match & Pull Up', kicker: 'Accept & Pullup' },
  { id: 'driver-cash-ride', section: 'DRIVER', title: 'Pullup. Ride. Drop Off.', kicker: 'Cash Ride' },
  { id: 'driver-menu-addons', section: 'DRIVER', title: 'Every Ride Is A Storefront', kicker: 'Menu & Add-Ons' },
  { id: 'driver-earnings', section: 'DRIVER', title: 'Earnings & Cashout', kicker: 'Earnings' },
  { id: 'driver-safety', section: 'DRIVER', title: 'Driver Safety', kicker: 'Safety' },
  { id: 'driver-support', section: 'DRIVER', title: 'Driver Support', kicker: 'Support' },
  // Rider
  { id: 'rider-booked-from-link', section: 'RIDER', title: 'Booked From A Link', kicker: 'Book From A Link' },
  { id: 'rider-onboarding', section: 'RIDER', title: 'Rider Onboarding', kicker: 'Onboarding' },
  { id: 'rider-find-driver', section: 'RIDER', title: 'Find A Driver', kicker: 'Find A Driver' },
  { id: 'rider-in-ride', section: 'RIDER', title: 'In-Ride Experience', kicker: 'In-Ride' },
  { id: 'rider-safety', section: 'RIDER', title: 'Rider Safety', kicker: 'Safety' },
  { id: 'rider-support', section: 'RIDER', title: 'Rider Support', kicker: 'Support' },
  // Platform
  { id: 'platform-viral-loop', section: 'PLATFORM', title: 'The Viral Loop', kicker: 'Growth' },
  { id: 'platform-trust', section: 'PLATFORM', title: 'Trust & Verification', kicker: 'Trust' },
  { id: 'platform-community', section: 'PLATFORM', title: 'Community & Reputation', kicker: 'Community' },
  { id: 'platform-admin-ops', section: 'PLATFORM', title: 'Admin Ops', kicker: 'Admin' },
  { id: 'platform-pricing', section: 'PLATFORM', title: 'Market & Pricing', kicker: 'Pricing' },
  { id: 'platform-hmu-first', section: 'PLATFORM', title: 'HMU First', kicker: 'HMU First' },
];

type VideoInfo = { url: string; size: number; uploaded: string };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminPitchVideosPage() {
  const [videos, setVideos] = useState<Record<string, VideoInfo>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const ffmpegRef = useRef<{ terminate: () => void } | null>(null);
  const [targetChapter, setTargetChapter] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchVideos = useCallback(async () => {
    const res = await fetch('/api/admin/pitch-videos');
    if (res.ok) setVideos(await res.json());
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleUploadClick = (chapterId: string) => {
    setTargetChapter(chapterId);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetChapter) return;

    setUploading(targetChapter);
    setProgress(0);

    let uploadFile = file;
    const isMp4 = file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');

    // Auto-convert non-MP4 files (e.g. .mov) to MP4 in the browser
    if (!isMp4) {
      setConverting(true);
      showToast(`Converting ${file.name.split('.').pop()?.toUpperCase()} to MP4...`);
      try {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');
        const { fetchFile } = await import('@ffmpeg/util');
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;
        ffmpeg.on('progress', ({ progress }) => {
          setProgress(Math.round(progress * 50)); // 0-50% for conversion
        });
        await ffmpeg.load();
        const inputName = 'input' + file.name.substring(file.name.lastIndexOf('.'));
        await ffmpeg.writeFile(inputName, await fetchFile(file));
        await ffmpeg.exec(['-i', inputName, '-vcodec', 'libx264', '-crf', '28', '-acodec', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'output.mp4']);
        const data = await ffmpeg.readFile('output.mp4');
        const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
        uploadFile = new File([blob], targetChapter + '.mp4', { type: 'video/mp4' });
        ffmpegRef.current = null;
        setConverting(false);
        showToast(`Converted to MP4 (${(uploadFile.size / 1024 / 1024).toFixed(1)}MB) — uploading...`);
      } catch (err) {
        ffmpegRef.current = null;
        setConverting(false);
        // If cancelled, state is already reset by handleCancel
        if (!uploading) return;
        console.error('Conversion failed:', err);
        showToast(`Conversion failed — convert manually: ffmpeg -i "${file.name}" -vcodec libx264 -crf 28 -acodec aac -b:a 128k output.mp4`);
        setUploading(null);
        setProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    const formData = new FormData();
    formData.append('video', uploadFile);
    formData.append('chapterId', targetChapter);

    try {
      // Use XMLHttpRequest for upload progress
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      const result = await new Promise<{ success: boolean; url?: string; error?: string }>((resolve, reject) => {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            // If file was converted, upload progress is 50-100%. Otherwise 0-100%.
            const base = isMp4 ? 0 : 50;
            const range = isMp4 ? 100 : 50;
            setProgress(base + Math.round((evt.loaded / evt.total) * range));
          }
        };
        xhr.onload = () => {
          xhrRef.current = null;
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error('Invalid response')); }
        };
        xhr.onerror = () => {
          xhrRef.current = null;
          reject(new Error('Upload failed'));
        };
        xhr.onabort = () => {
          xhrRef.current = null;
          resolve({ success: false, error: 'cancelled' });
        };
        xhr.open('POST', '/api/admin/pitch-videos');
        xhr.send(formData);
      });

      if (result.success) {
        showToast(`Uploaded to ${targetChapter}`);
        await fetchVideos();
      } else if (result.error !== 'cancelled') {
        showToast(result.error || 'Upload failed');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed');
    }

    setUploading(null);
    setProgress(0);
    setTargetChapter(null);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (chapterId: string) => {
    if (!confirm(`Remove video from "${chapterId}"? The pitch page will show COMING SOON.`)) return;
    setDeleting(chapterId);

    const res = await fetch('/api/admin/pitch-videos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId }),
    });

    if (res.ok) {
      showToast(`Removed ${chapterId}`);
      await fetchVideos();
    }
    setDeleting(null);
  };

  const handleCancel = () => {
    if (ffmpegRef.current) {
      try { ffmpegRef.current.terminate(); } catch {}
      ffmpegRef.current = null;
    }
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setUploading(null);
    setConverting(false);
    setProgress(0);
    setTargetChapter(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast('Upload cancelled');
  };

  const uploadedCount = Object.keys(videos).length;
  const totalSlots = CHAPTER_SLOTS.length;
  const sections = ['DRIVER', 'RIDER', 'PLATFORM'] as const;

  return (
    <div className="p-6 max-w-5xl">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.webm"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#00E676] text-black px-4 py-2 rounded-lg text-sm font-bold shadow-lg animate-in fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Pitch Videos</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Upload 9:16 vertical videos for each chapter on the{' '}
          <a href="/pitch" target="_blank" className="text-[#00E676] hover:underline">/pitch</a> page.
          Chapters without a video show &ldquo;COMING SOON&rdquo;.
        </p>
        <div className="flex items-center gap-4 mt-3">
          <div className="text-xs text-neutral-400">
            <span className="text-[#00E676] font-bold">{uploadedCount}</span> / {totalSlots} uploaded
          </div>
          <div className="flex-1 max-w-xs h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00E676] rounded-full transition-all duration-500"
              style={{ width: `${(uploadedCount / totalSlots) * 100}%` }}
            />
          </div>
          <a
            href="/pitch"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#00E676] hover:underline"
          >
            View Live Pitch Page
          </a>
        </div>
      </div>

      {/* Sections */}
      {sections.map((sectionName) => {
        const sectionSlots = CHAPTER_SLOTS.filter((s) => s.section === sectionName);
        const sectionUploaded = sectionSlots.filter((s) => videos[s.id]).length;

        return (
          <div key={sectionName} className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-bold tracking-[3px] text-neutral-400">
                {sectionName}
              </h2>
              <span className="text-[10px] text-neutral-600">
                {sectionUploaded}/{sectionSlots.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sectionSlots.map((slot) => {
                const video = videos[slot.id];
                const isUploading = uploading === slot.id;
                const isDeleting = deleting === slot.id;

                return (
                  <div
                    key={slot.id}
                    className={`bg-neutral-900 border rounded-xl overflow-hidden transition-colors ${
                      video
                        ? 'border-[#00E676]/20'
                        : 'border-neutral-800'
                    }`}
                  >
                    {/* Video preview or placeholder */}
                    <div className="relative aspect-[9/16] bg-neutral-950 max-h-[280px] overflow-hidden">
                      {video ? (
                        <video
                          src={video.url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          loop
                          preload="metadata"
                          onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                          onTouchStart={(e) => e.currentTarget.play().catch(() => {})}
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <span className="text-[#ffb300] text-xs font-bold tracking-[2px]">
                            COMING SOON
                          </span>
                          <span className="text-[10px] text-neutral-600">
                            9:16 &middot; MP4
                          </span>
                        </div>
                      )}

                      {/* Upload progress overlay */}
                      {isUploading && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
                          <span className="text-[10px] text-neutral-400 font-medium">
                            {converting ? 'Converting...' : 'Uploading...'}
                          </span>
                          <div className="w-24 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#00E676] rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-[#00E676] font-mono">
                            {progress}%
                          </span>
                          <button
                            onClick={handleCancel}
                            className="mt-1 px-3 py-1 text-[10px] text-red-400 border border-red-400/30 rounded-md hover:bg-red-400/10 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Status badge */}
                      {video && (
                        <div className="absolute top-2 right-2 bg-[#00E676]/20 text-[#00E676] text-[9px] font-bold px-2 py-0.5 rounded-full">
                          LIVE
                        </div>
                      )}
                    </div>

                    {/* Info + actions */}
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-xs font-bold">{slot.title}</p>
                          <p className="text-[10px] text-neutral-500">{slot.kicker}</p>
                        </div>
                        {video && (
                          <span className="text-[9px] text-neutral-600 font-mono shrink-0">
                            {formatSize(video.size)}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUploadClick(slot.id)}
                          disabled={isUploading}
                          className="flex-1 py-2 text-xs font-medium rounded-lg transition-colors bg-white/5 hover:bg-white/10 border border-neutral-700 disabled:opacity-50"
                        >
                          {isUploading ? 'Uploading...' : video ? 'Replace' : 'Upload'}
                        </button>
                        {video && (
                          <button
                            onClick={() => handleDelete(slot.id)}
                            disabled={isDeleting}
                            className="px-3 py-2 text-xs text-red-400/50 hover:text-red-400 rounded-lg transition-colors border border-neutral-800 hover:border-red-400/30 disabled:opacity-50"
                          >
                            {isDeleting ? '...' : 'Remove'}
                          </button>
                        )}
                      </div>

                      {/* Pitch page link */}
                      <a
                        href={`/pitch#${slot.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-2 text-[10px] text-neutral-600 hover:text-[#00E676] transition-colors truncate"
                      >
                        /pitch#{slot.id}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
