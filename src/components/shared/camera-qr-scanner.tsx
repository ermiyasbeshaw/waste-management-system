"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Scan, AlertCircle, Upload } from "lucide-react";

type BarcodeDetectorLike = {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

interface CameraQrScannerProps {
  onScan: (scannedText: string) => void;
  onClose?: () => void;
  buttonLabel?: string;
  autoStart?: boolean;
}

export function CameraQrScanner({
  onScan,
  onClose,
  buttonLabel = "Scan QR with Camera",
  autoStart = false,
}: CameraQrScannerProps) {
  const [isOpen, setIsOpen] = useState(autoStart);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHasBarcodeDetector(
      typeof window !== "undefined" && "BarcodeDetector" in window
    );
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsOpen(false);
    onClose?.();
  };

  const startCamera = async () => {
    setErrorMessage(null);
    setIsOpen(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasPermission(false);
      setErrorMessage("Camera access is not supported by your browser. Please type the QR code manually or upload an image.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setHasPermission(false);
      setErrorMessage("Unable to access camera. Please allow camera permissions or enter the code manually.");
    }
  };

  useEffect(() => {
    if (!isOpen || !hasPermission) return;

    let active = true;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const scanFrame = async () => {
      if (!active || !videoRef.current) return;

      if (
        hasBarcodeDetector &&
        videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        try {
          const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor })
            .BarcodeDetector;
          const detector = new Detector({ formats: ["qr_code"] });
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            const code = barcodes[0].rawValue.trim();
            if (typeof navigator.vibrate === "function") navigator.vibrate(100);
            onScan(code);
            stopCamera();
            return;
          }
        } catch {
          // Frame not ready or detection cycle dropped
        }
      }

      timerId = setTimeout(scanFrame, 350);
    };

    timerId = setTimeout(scanFrame, 500);

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [isOpen, hasPermission, hasBarcodeDetector]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!hasBarcodeDetector) {
      setErrorMessage("Image recognition requires BarcodeDetector API. Please enter code manually.");
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor })
        .BarcodeDetector;
      const detector = new Detector({ formats: ["qr_code"] });
      const barcodes = await detector.detect(bitmap);
      if (barcodes.length > 0 && barcodes[0].rawValue) {
        const code = barcodes[0].rawValue.trim();
        if (typeof navigator.vibrate === "function") navigator.vibrate(100);
        onScan(code);
        stopCamera();
      } else {
        setErrorMessage("No QR code detected in the uploaded image. Please try again or type the code.");
      }
    } catch {
      setErrorMessage("Could not decode QR code from the uploaded image.");
    }
  };

  return (
    <div className="space-y-2">
      {!isOpen ? (
        <button
          type="button"
          onClick={startCamera}
          className="w-full min-h-[44px] px-4 rounded-xl text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          <Camera className="w-4 h-4 text-amber-400" />
          {buttonLabel}
        </button>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border-2 border-amber-500/50 bg-black/90 p-3 space-y-3 shadow-2xl animate-in fade-in">
          <div className="flex items-center justify-between text-xs text-zinc-300 px-1">
            <span className="flex items-center gap-1.5 font-semibold text-amber-400">
              <Scan className="w-4 h-4 animate-pulse" />
              Scanning for QR Code...
            </span>
            <button
              type="button"
              onClick={stopCamera}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-[11px] flex items-center gap-1"
            >
              <CameraOff className="w-3.5 h-3.5" />
              Close Camera
            </button>
          </div>

          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />

            {/* Target Reticle Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-2 border-amber-400/80 rounded-2xl relative shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-amber-400 rounded-tl -mt-1 -ml-1" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-amber-400 rounded-tr -mt-1 -mr-1" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-amber-400 rounded-bl -mb-1 -ml-1" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-amber-400 rounded-br -mb-1 -mr-1" />
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent absolute top-1/2 -translate-y-1/2 animate-bounce" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
            <span>Point camera directly at the QR code</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Upload className="w-3 h-3" />
              Snap photo or upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
