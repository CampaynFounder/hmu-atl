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
  Pause,
  Loader2,
  Volume2,
  CloudUpload,
} from 'lucide-react';

interface VideoRecorderProps {
  onVideoRecorded: (videoUrl: string, thumbnailUrl: string) => void;
  existingVideoUrl?: string;
  profileType?: 'rider' | 'driver';
  onUploadStateChange?: (uploading: boolean) => void;
}

type Step = 'choose' | 'camera' | 'upload' | 'review' | 'uploading' | 'saved';

const MAX_DURATION = 5000;

export function VideoRecorder({ onVideoRecorded, existingVideoUrl, profileType = 'rider', onUploadStateChange }: VideoRecorderProps) {
  const [step, setStep] = useState<Step>('choose');
  const [countdown, setCountdown] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(existingVideoUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Camera management (video only — no mic until recording) ──

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    try {
      // Video only — no audio until recording starts
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
      }
      setCameraReady(true);
      setError(null);
    } catch {
      setError('Unable to access camera. Please allow camera permissions.');
    }
  }, [stopCamera]);

  // Attach stream when ref becomes available
  useEffect(() => {
    if (cameraReady && streamRef.current && liveVideoRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
    }
  }, [cameraReady]);

  // Auto-start camera when entering camera step
  useEffect(() => {
    if (step === 'camera' && !cameraReady) {
      startCamera();
    }
  }, [step, cameraReady, startCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [stopCamera]);

  // ── Recording ──

  const startRecording = () => {
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          beginRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const beginRecording = async () => {
    // Stop video-only stream and get a new one with audio
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      streamRef.current = stream;

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
      }
      setCameraReady(true);
    } catch {
      setError('Unable to access microphone.');
      return;
    }

    chunksRef.current = [];

    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4';

    const mediaRecorder = new MediaRecorder(streamRef.current!, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const type = mimeType.split(';')[0];
      const blob = new Blob(chunksRef.current, { type });
      setVideoBlob(blob);
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      stopCamera();
      setIsRecording(false);
      setStep('review');
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingProgress(0);

    const startTime = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setRecordingProgress(Math.min((elapsed / MAX_DURATION) * 100, 100));
      if (elapsed >= MAX_DURATION) {
        if (progressRef.current) clearInterval(progressRef.current);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }
    }, 50);
  };

  // ── Preview playback ──

  const playPreview = useCallback(() => {
    const vid = previewVideoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.muted = isMuted;
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (previewVideoRef.current) previewVideoRef.current.muted = next;
      return next;
    });
  }, []);

  // Auto-play preview when entering review/saved step
  useEffect(() => {
    if ((step === 'review' || step === 'saved') && videoUrl && previewVideoRef.current) {
      const vid = previewVideoRef.current;
      vid.src = videoUrl;
      vid.muted = true;
      setIsMuted(true);
      vid.load();
      vid.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [step, videoUrl]);

  // ── Actions ──

  const retake = useCallback(() => {
    if (videoUrl && !existingVideoUrl) URL.revokeObjectURL(videoUrl);
    setVideoBlob(null);
    setVideoUrl(null);
    setRecordingProgress(0);
    setIsPlaying(false);
    setIsRecording(false);
    setIsMuted(true);
    setStep('camera');
    setCameraReady(false); // Force camera restart
  }, [videoUrl, existingVideoUrl]);

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
    setStep('review');
    setError(null);
  };

  const uploadVideo = async () => {
    if (!videoBlob) { setError('No video to save'); return; }

    setStep('uploading');
    setUploadProgress(0);
    onUploadStateChange?.(true);
    setError(null);

    const formData = new FormData();
    const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('video', videoBlob, `intro-video.${ext}`);
    formData.append('profile_type', profileType);
    formData.append('media_type', 'video');

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          const savedUrl = data.url || data.videoUrl;
          onVideoRecorded(savedUrl, savedUrl);
          onUploadStateChange?.(false);
          setStep('saved');
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      } catch (err) {
        console.error('Upload error:', err);
        setError(err instanceof Error ? err.message : 'Failed to upload video. Try again.');
        setStep('review');
        onUploadStateChange?.(false);
      }
    });

    xhr.addEventListener('error', () => {
      setError('Upload failed. Check your connection and try again.');
      setStep('review');
      onUploadStateChange?.(false);
    });

    xhr.open('POST', '/api/upload/video');
    xhr.send(formData);
  };

  // ── Render ──

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {/* Step 1: Choose method */}
        {step === 'choose' && (
          <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <button
              onClick={() => setStep('camera')}
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
              onClick={() => setStep('upload')}
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

        {/* Step 2a: Camera / Recording */}
        {step === 'camera' && (
          <motion.div key="camera" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="relative aspect-[9/16] max-h-[400px] mx-auto overflow-hidden rounded-2xl bg-black">
              <video
                ref={liveVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />

              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[#00E676]" />
                </div>
              )}

              {countdown > 0 && (
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

              {isRecording && (
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
                    <div className="h-full bg-white transition-all" style={{ width: `${recordingProgress}%` }} />
                  </div>
                </div>
              )}

              {cameraReady && !isRecording && countdown === 0 && (
                <div className="absolute bottom-4 left-0 right-0 px-4 text-center">
                  <div className="rounded-xl bg-black/60 p-3 text-white text-sm">
                    Tap record below — smile and say hi!
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => { stopCamera(); setStep('choose'); }}
                disabled={isRecording}
                className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Back
              </button>
              {cameraReady && !isRecording && countdown === 0 && (
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

        {/* Step 2b: Upload file */}
        {step === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-zinc-700 p-10 text-center hover:border-[#00E676]/30 hover:bg-[#00E676]/5 transition-all">
              <Upload className="mx-auto h-10 w-10 text-zinc-500 mb-3" />
              <p className="font-semibold text-white mb-1">Tap to choose video</p>
              <p className="text-sm text-zinc-400">MP4 or WebM, max 10 seconds</p>
              <input type="file" accept="video/*" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              onClick={() => setStep('choose')}
              className="w-full rounded-full border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Back
            </button>
          </motion.div>
        )}

        {/* Step 3: Review / Uploading / Saved — single video preview */}
        {(step === 'review' || step === 'uploading' || step === 'saved') && videoUrl && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div
              className="relative aspect-[9/16] max-h-[400px] mx-auto overflow-hidden rounded-2xl bg-black cursor-pointer"
              onClick={playPreview}
            >
              <video
                ref={previewVideoRef}
                className="h-full w-full object-contain"
                loop
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              {/* Play overlay */}
              {!isPlaying && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none gap-2">
                  <div className="rounded-full bg-white/20 p-4">
                    <Play className="h-10 w-10 text-white fill-white" />
                  </div>
                  <span className="text-white/80 text-xs font-medium">Tap to play</span>
                </div>
              )}

              {/* Playing indicators */}
              {isPlaying && (
                <>
                  <div className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-white text-xs font-bold pointer-events-none">
                    {step === 'saved' ? 'Saved ✓' : 'Preview'}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white"
                  >
                    {isMuted ? <Volume2 className="h-4 w-4 opacity-40" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
                    <span className="text-white/50 text-xs">Tap to pause</span>
                  </div>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={retake}
                disabled={step === 'uploading'}
                className="flex items-center gap-2 rounded-full border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
                {step === 'saved' ? 'Re-record' : 'Retake'}
              </button>

              {step === 'saved' ? (
                <div className="flex items-center gap-2 rounded-full bg-[#00E676]/15 border border-[#00E676]/30 px-8 py-3 font-bold text-[#00E676]">
                  <Check className="h-5 w-5" />
                  Saved — tap Next
                </div>
              ) : step === 'uploading' ? (
                <div className="flex flex-col items-center gap-2 min-w-[180px]">
                  <div className="flex items-center gap-2 rounded-full bg-[#00E676]/15 border border-[#00E676]/30 px-6 py-3 font-bold text-[#00E676]">
                    <CloudUpload className="h-5 w-5 animate-pulse" />
                    Uploading {uploadProgress}%
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-[#00E676] rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={uploadVideo}
                  className="flex items-center gap-2 rounded-full bg-[#00E676] px-8 py-3 font-bold text-black"
                >
                  <Check className="h-5 w-5" />
                  Use This Video
                </button>
              )}
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
