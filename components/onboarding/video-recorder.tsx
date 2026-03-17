'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video,
  Camera,
  RotateCcw,
  Upload,
  Check,
  AlertCircle,
  Play,
  Pause,
  Loader2,
} from 'lucide-react';

interface VideoRecorderProps {
  onVideoRecorded: (videoUrl: string, thumbnailUrl: string) => void;
  existingVideoUrl?: string;
}

type RecordingMode = 'choose' | 'record' | 'upload';
type RecordingState = 'idle' | 'countdown' | 'recording' | 'preview' | 'uploading';

export function VideoRecorder({ onVideoRecorded, existingVideoUrl }: VideoRecorderProps) {
  const [mode, setMode] = useState<RecordingMode>('choose');
  const [state, setState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(3);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(existingVideoUrl || null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const MAX_DURATION = 5000; // 5 seconds

  // Initialize camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: true,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setState('idle');
      setError(null);
    } catch (err) {
      console.error('Camera access error:', err);
      setError(
        'Unable to access camera. Please allow camera permissions and try again.'
      );
    }
  };

  // Start recording with countdown
  const startRecording = () => {
    setState('countdown');
    setCountdown(3);

    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          beginRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Begin actual recording
  const beginRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'video/webm;codecs=vp9',
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setVideoBlob(blob);
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setState('preview');
      stopCamera();
      generateThumbnail(blob);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setState('recording');
    setRecordingProgress(0);

    // Progress animation
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / MAX_DURATION) * 100, 100);
      setRecordingProgress(progress);

      if (elapsed >= MAX_DURATION) {
        clearInterval(progressInterval);
        stopRecording();
      }
    }, 50);
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Retake video
  const retake = () => {
    setVideoBlob(null);
    setVideoUrl(null);
    setThumbnailUrl(null);
    setRecordingProgress(0);
    startCamera();
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      setError('Please upload a video file');
      return;
    }

    // Validate duration
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);

      if (video.duration > 10) {
        setError("Video must be 10 seconds or less. We'll auto-crop to 5 seconds.");
      }

      // Accept the video
      setVideoBlob(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setState('preview');
      generateThumbnail(file);
      setError(null);
    };

    video.src = URL.createObjectURL(file);
  };

  // Generate thumbnail from video
  const generateThumbnail = (blob: Blob) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    video.onloadeddata = () => {
      video.currentTime = 0.5; // 500ms into video
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);

      canvas.toBlob((thumbnailBlob) => {
        if (thumbnailBlob) {
          const thumbUrl = URL.createObjectURL(thumbnailBlob);
          setThumbnailUrl(thumbUrl);
        }
      }, 'image/jpeg', 0.8);
    };

    video.src = URL.createObjectURL(blob);
  };

  // Upload to server
  const uploadVideo = async () => {
    if (!videoBlob || !thumbnailUrl) return;

    setState('uploading');
    setError(null);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('video', videoBlob, 'intro-video.webm');
      formData.append('profile_type', 'rider');

      // Upload to server (which will upload to Cloudflare R2)
      const response = await fetch('/api/upload/video', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();

      // Track activity
      await fetch('/api/users/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'video_recorded',
          properties: {
            recordingMethod: mode,
            duration: MAX_DURATION / 1000,
          },
        }),
      });

      // Callback with URLs
      onVideoRecorded(data.videoUrl, data.thumbnailUrl);
      setState('preview');
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload video. Please try again.');
      setState('preview');
    }
  };

  // Auto-play preview when recording/upload is done
  useEffect(() => {
    if (state === 'preview' && previewRef.current) {
      previewRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [state, videoUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (videoUrl && !existingVideoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [videoUrl, thumbnailUrl, existingVideoUrl]);

  // Auto-start camera when recording mode selected
  useEffect(() => {
    if (mode === 'record' && state === 'idle') {
      startCamera();
    }
  }, [mode]);

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {/* Mode Selection */}
        {mode === 'choose' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <button
              onClick={() => setMode('record')}
              className="group w-full rounded-2xl border-2 border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 p-6 text-left transition-all hover:shadow-lg dark:from-purple-950 dark:to-pink-950"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-purple-500 p-3 text-white group-hover:scale-110 transition-transform">
                  <Camera className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-lg mb-1">
                    Record Now <span className="text-sm font-normal">(Recommended)</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Quick 5-second intro. Just smile and say hi! 👋
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('upload')}
              className="group w-full rounded-2xl border-2 border-gray-300 bg-white p-6 text-left transition-all hover:border-gray-400 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-gray-200 p-3 text-gray-700 group-hover:scale-110 transition-transform dark:bg-zinc-700 dark:text-gray-300">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-lg mb-1">Upload Existing Video</div>
                  <p className="text-sm text-muted-foreground">
                    Have a video ready? Upload it here (max 10s, we&apos;ll crop to 5s)
                  </p>
                </div>
              </div>
            </button>

            {/* Why it matters */}
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 dark:bg-amber-950 dark:border-amber-800">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                🔥 Verified riders get matched 3x faster
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Drivers prefer riders with a face intro. It only takes 5 seconds — just smile and say hi!
              </p>
            </div>
          </motion.div>
        )}

        {/* Recording Interface */}
        {mode === 'record' && state !== 'preview' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-4"
          >
            {/* Camera View */}
            <div className="relative aspect-[9/16] max-h-[600px] mx-auto overflow-hidden rounded-3xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />

              {/* Countdown Overlay */}
              {state === 'countdown' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                >
                  <motion.div
                    key={countdown}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-9xl font-black text-white"
                  >
                    {countdown}
                  </motion.div>
                </motion.div>
              )}

              {/* Recording Indicator */}
              {state === 'recording' && (
                <div className="absolute top-4 left-4 right-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 rounded-full bg-red-500 px-3 py-1.5 text-white">
                      <div className="h-3 w-3 animate-pulse rounded-full bg-white" />
                      <span className="text-sm font-bold">REC</span>
                    </div>
                    <span className="rounded-full bg-black/70 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                      {((recordingProgress / 100) * 5).toFixed(1)}s
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/30">
                    <motion.div
                      className="h-full bg-white"
                      style={{ width: `${recordingProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Instructions */}
              {state === 'idle' && (
                <div className="absolute bottom-8 left-0 right-0 px-6 text-center">
                  <div className="rounded-2xl bg-black/70 p-4 text-white backdrop-blur-sm">
                    <p className="font-medium">
                      Tap the button below to start recording
                    </p>
                    <p className="text-sm text-white/70 mt-1">
                      Say hi and introduce yourself in 5 seconds!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              {state === 'idle' && (
                <>
                  <button
                    onClick={() => setMode('choose')}
                    className="rounded-full border-2 border-gray-300 px-6 py-3 font-semibold transition-all hover:bg-gray-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Back
                  </button>
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-pink-500 px-8 py-4 font-bold text-white shadow-lg transition-all hover:shadow-xl active:scale-95"
                  >
                    <Camera className="h-5 w-5" />
                    Start Recording
                  </button>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Upload Interface */}
        {mode === 'upload' && state !== 'preview' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="rounded-2xl border-2 border-dashed border-gray-300 p-12 text-center dark:border-zinc-700">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="font-semibold mb-2">Upload your intro video</p>
              <p className="text-sm text-muted-foreground mb-6">
                MP4, WebM, or MOV (max 10 seconds)
              </p>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-bold text-white transition-all hover:shadow-lg">
                <Upload className="h-5 w-5" />
                Choose File
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={() => setMode('choose')}
              className="w-full rounded-full border-2 border-gray-300 px-6 py-3 font-semibold transition-all hover:bg-gray-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Back
            </button>

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Preview */}
        {(state === 'preview' || state === 'uploading') && videoUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <p className="text-center text-sm font-medium text-muted-foreground">
              Review your intro — tap to play/pause
            </p>

            <div className="relative aspect-[9/16] max-h-[500px] mx-auto overflow-hidden rounded-3xl bg-black">
              <video
                ref={previewRef}
                src={videoUrl}
                className="h-full w-full object-cover"
                loop
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={() => {
                  if (previewRef.current) {
                    if (isPlaying) {
                      previewRef.current.pause();
                    } else {
                      previewRef.current.play();
                    }
                  }
                }}
              />

              {/* Play/Pause Overlay */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                  <div className="rounded-full bg-white/90 p-6">
                    <Play className="h-12 w-12 text-black" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={retake}
                disabled={state === 'uploading'}
                className="flex items-center gap-2 rounded-full border-2 border-gray-300 px-6 py-3 font-semibold transition-all hover:bg-gray-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <RotateCcw className="h-5 w-5" />
                Retake
              </button>
              <button
                onClick={uploadVideo}
                disabled={state === 'uploading'}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 px-8 py-3 font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 active:scale-95"
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

            {state !== 'uploading' && (
              <p className="text-center text-xs text-muted-foreground">
                Happy with it? Hit <strong>Use This Video</strong> then tap Next to continue.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
