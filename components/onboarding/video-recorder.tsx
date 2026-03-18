'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  RotateCcw,
  Upload,
  Check,
  AlertCircle,
  Play,
  Loader2,
} from 'lucide-react';

interface VideoRecorderProps {
  onVideoRecorded: (videoUrl: string, thumbnailUrl: string) => void;
  existingVideoUrl?: string;
  profileType?: 'rider' | 'driver';
}

type RecordingMode = 'choose' | 'record' | 'upload';
type RecordingState = 'idle' | 'countdown' | 'recording' | 'preview' | 'uploading';

const MAX_DURATION = 5000;

export function VideoRecorder({ onVideoRecorded, existingVideoUrl, profileType = 'rider' }: VideoRecorderProps) {
  const [mode, setMode] = useState<RecordingMode>('choose');
  const [state, setState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(3);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(existingVideoUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    // Stop any existing stream first
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      streamRef.current = stream;
      setCameraReady(true);
      setError(null);
    } catch {
      setError('Unable to access camera. Please allow camera permissions.');
    }
  }, [stopCamera]);

  // Attach stream to video element whenever camera becomes ready or videoRef changes
  useEffect(() => {
    if (cameraReady && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraReady, state, mode]);

  const startRecording = () => {
    setState('countdown');
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          beginRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const beginRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];

    // Try different mime types for browser compatibility
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
    }

    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const type = mimeType.split(';')[0];
      const blob = new Blob(chunksRef.current, { type });
      setVideoBlob(blob);
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setState('preview');
      stopCamera();
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setState('recording');
    setRecordingProgress(0);

    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setRecordingProgress(Math.min((elapsed / MAX_DURATION) * 100, 100));
      if (elapsed >= MAX_DURATION) {
        clearInterval(progressInterval);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }
    }, 50);
  };

  const retake = useCallback(() => {
    if (videoUrl && !existingVideoUrl) URL.revokeObjectURL(videoUrl);
    setVideoBlob(null);
    setVideoUrl(null);
    setRecordingProgress(0);
    setState('idle');
    // Delay camera start to let the UI re-render the video element
    setTimeout(() => startCamera(), 100);
  }, [videoUrl, existingVideoUrl, startCamera]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('Please upload a video file');
      return;
    }

    setVideoBlob(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setState('preview');
    setError(null);
  };

  // Upload to R2 and save to profile
  const uploadVideo = async () => {
    if (!videoBlob) {
      setError('No video to save');
      return;
    }

    setState('uploading');
    setError(null);

    try {
      const formData = new FormData();
      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
      formData.append('video', videoBlob, `intro-video.${ext}`);
      formData.append('profile_type', profileType);
      formData.append('media_type', 'video');

      const response = await fetch('/api/upload/video', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      const savedUrl = data.url || data.videoUrl;
      onVideoRecorded(savedUrl, savedUrl);
      // Keep preview state so user sees confirmation
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload video. Try again.');
      setState('preview');
    }
  };

  // Auto-play preview
  useEffect(() => {
    if (state === 'preview' && previewRef.current && videoUrl) {
      previewRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [state, videoUrl]);

  // Auto-start camera when record mode selected
  useEffect(() => {
    if (mode === 'record' && state === 'idle') {
      startCamera();
    }
    return () => {
      if (mode !== 'record') stopCamera();
    };
  }, [mode, state, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const showCamera = mode === 'record' && state !== 'preview' && state !== 'uploading';
  const showPreview = (state === 'preview' || state === 'uploading') && videoUrl;

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {/* Mode Selection */}
        {mode === 'choose' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <button
              onClick={() => setMode('record')}
              className="group w-full rounded-2xl border-2 border-[#00E676] bg-[#00E676]/5 p-5 text-left transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-[#00E676] p-3 text-black">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-white">Record Now</div>
                  <p className="text-sm text-zinc-400">Quick 5-second intro</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('upload')}
              className="group w-full rounded-2xl border-2 border-zinc-700 bg-zinc-900 p-5 text-left transition-all hover:border-zinc-500"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-zinc-700 p-3 text-zinc-300">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-white">Upload Video</div>
                  <p className="text-sm text-zinc-400">MP4 or WebM, max 10 seconds</p>
                </div>
              </div>
            </button>
          </motion.div>
        )}

        {/* Camera / Recording */}
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="relative aspect-[9/16] max-h-[400px] mx-auto overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />

              {!cameraReady && state === 'idle' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[#00E676]" />
                </div>
              )}

              {state === 'countdown' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <motion.div
                    key={countdown}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-8xl font-black text-white"
                  >
                    {countdown}
                  </motion.div>
                </div>
              )}

              {state === 'recording' && (
                <div className="absolute top-3 left-3 right-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-white text-sm font-bold">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
                      REC
                    </div>
                    <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white">
                      {((recordingProgress / 100) * 5).toFixed(1)}s
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-white/20 overflow-hidden">
                    <div className="h-full bg-white" style={{ width: `${recordingProgress}%` }} />
                  </div>
                </div>
              )}

              {state === 'idle' && cameraReady && (
                <div className="absolute bottom-4 left-0 right-0 px-4 text-center">
                  <div className="rounded-xl bg-black/60 p-3 text-white text-sm">
                    Tap record below — smile and say hi!
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => { stopCamera(); setMode('choose'); setState('idle'); }}
                className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Back
              </button>
              {state === 'idle' && cameraReady && (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 rounded-full bg-[#00E676] px-8 py-3 font-bold text-black"
                >
                  <Camera className="h-5 w-5" />
                  Record
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Upload Interface */}
        {mode === 'upload' && state !== 'preview' && state !== 'uploading' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-zinc-700 p-10 text-center hover:border-[#00E676]/30 hover:bg-[#00E676]/5 transition-all">
              <Upload className="mx-auto h-10 w-10 text-zinc-500 mb-3" />
              <p className="font-semibold text-white mb-1">Tap to choose video</p>
              <p className="text-sm text-zinc-400">MP4 or WebM, max 10 seconds</p>
              <input type="file" accept="video/*" onChange={handleFileUpload} className="hidden" />
            </label>

            <button
              onClick={() => setMode('choose')}
              className="w-full rounded-full border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Back
            </button>
          </motion.div>
        )}

        {/* Preview */}
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="relative aspect-[9/16] max-h-[350px] mx-auto overflow-hidden rounded-2xl bg-black">
              <video
                ref={previewRef}
                src={videoUrl}
                className="h-full w-full object-cover"
                loop
                playsInline
                muted
                onClick={() => {
                  if (previewRef.current) {
                    isPlaying ? previewRef.current.pause() : previewRef.current.play();
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                  <Play className="h-12 w-12 text-white" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={retake}
                disabled={state === 'uploading'}
                className="flex items-center gap-2 rounded-full border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
                Retake
              </button>
              <button
                onClick={uploadVideo}
                disabled={state === 'uploading'}
                className="flex items-center gap-2 rounded-full bg-[#00E676] px-8 py-3 font-bold text-black disabled:opacity-40"
              >
                {state === 'uploading' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    Use This Video
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
