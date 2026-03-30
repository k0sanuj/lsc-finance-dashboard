"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraCaptureProps = {
  onCapture: (file: File) => void;
  onCancel: () => void;
};

type CameraStatus = "initializing" | "streaming" | "preview" | "error";

export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const [status, setStatus] = useState<CameraStatus>("initializing");
  const [errorMessage, setErrorMessage] = useState("");
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const capturedUrlRef = useRef<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  const revokePreview = useCallback(() => {
    if (capturedUrlRef.current) {
      URL.revokeObjectURL(capturedUrlRef.current);
      capturedUrlRef.current = null;
      setCapturedUrl(null);
    }
    blobRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setStatus("initializing");
    setErrorMessage("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Camera is not supported in this browser.");
      setStatus("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Handle stream ending unexpectedly (e.g. permission revoked)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          setErrorMessage("Camera stream ended unexpectedly.");
          setStatus("error");
          streamRef.current = null;
        });
      }

      setStatus("streaming");
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setErrorMessage(
            "Camera access was denied. Please allow camera access in your browser settings, or use the file upload instead."
          );
        } else if (err.name === "NotFoundError") {
          setErrorMessage("No camera found on this device.");
        } else if (err.name === "NotReadableError") {
          setErrorMessage(
            "Camera is in use by another application. Close other apps using the camera and try again."
          );
        } else {
          setErrorMessage(`Camera error: ${err.message}`);
        }
      } else {
        setErrorMessage("Could not access the camera.");
      }
      setStatus("error");
    }
  }, []);

  // Start camera on mount
  useEffect(() => {
    startCamera();

    return () => {
      // Cleanup on unmount
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      if (capturedUrlRef.current) {
        URL.revokeObjectURL(capturedUrlRef.current);
        capturedUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Stop the camera immediately after capture
    stopStream();

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorMessage("Failed to capture image.");
          setStatus("error");
          return;
        }

        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        capturedUrlRef.current = url;
        setCapturedUrl(url);
        setStatus("preview");
      },
      "image/jpeg",
      0.85
    );
  }, [stopStream]);

  const handleRetake = useCallback(() => {
    revokePreview();
    startCamera();
  }, [revokePreview, startCamera]);

  const handleUsePhoto = useCallback(() => {
    const blob = blobRef.current;
    if (!blob) return;

    const timestamp = Date.now();
    const file = new File([blob], `receipt-${timestamp}.jpg`, {
      type: "image/jpeg",
    });

    onCapture(file);
  }, [onCapture]);

  const handleCancel = useCallback(() => {
    stopStream();
    revokePreview();
    onCancel();
  }, [stopStream, revokePreview, onCancel]);

  return (
    <div className="camera-capture">
      {status === "initializing" && (
        <div className="loading-block">
          <div className="loading-spinner lg" />
          <strong>Starting camera...</strong>
          <span className="muted">Please allow camera access when prompted</span>
        </div>
      )}

      {status === "streaming" && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-viewfinder"
          />
          <div className="camera-controls">
            <button
              className="action-button secondary"
              onClick={handleCancel}
              type="button"
            >
              Back
            </button>
            <button
              aria-label="Capture photo"
              className="camera-shutter-button"
              onClick={handleCapture}
              type="button"
            />
            <span className="camera-hint">Tap to capture</span>
          </div>
        </>
      )}

      {status === "preview" && capturedUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Captured receipt"
            className="camera-preview-image"
            src={capturedUrl}
          />
          <div className="camera-controls">
            <button
              className="action-button secondary"
              onClick={handleRetake}
              type="button"
            >
              Retake
            </button>
            <button
              className="action-button primary"
              onClick={handleUsePhoto}
              type="button"
            >
              Use this photo
            </button>
          </div>
        </>
      )}

      {status === "error" && (
        <>
          <div className="notice error">
            <strong>Camera unavailable</strong>
            <span>{errorMessage}</span>
          </div>
          <button
            className="action-button secondary"
            onClick={handleCancel}
            type="button"
          >
            Back to file upload
          </button>
        </>
      )}
    </div>
  );
}
