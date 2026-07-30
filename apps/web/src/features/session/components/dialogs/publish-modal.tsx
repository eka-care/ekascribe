'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Badge,
} from '@ui/src';
import {
  X,
  Loader2,
  TriangleAlert,
  RotateCcw,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  ArrowUp,
  Check,
} from 'lucide-react';
import { buildPrintPreviewHtml } from '@/features/session/services/document-service';

type PublishState = 'review' | 'publishing' | 'success' | 'error';

type PublishModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  patientName?: string;
  patientAge?: number;
  patientSex?: string;
  noteType: string;
  onPublish: () => Promise<boolean>;
};

const ZOOM_LEVELS = [50, 75, 100, 125, 150];
const A4_WIDTH_PX = 793;

export function PublishModal({
  open,
  onOpenChange,
  sessionId,
  patientName,
  patientAge,
  patientSex,
  noteType,
  onPublish,
}: PublishModalProps) {
  const [publishState, setPublishState] = useState<PublishState>('review');
  const [zoomIndex, setZoomIndex] = useState(2);
  const [previewHtml, setPreviewHtml] = useState('');
  const zoomLevel = ZOOM_LEVELS[zoomIndex];

  useEffect(() => {
    if (!open) return;
    buildPrintPreviewHtml(sessionId).then((html) => {
      if (html) setPreviewHtml(html);
    });
  }, [open, sessionId]);

  const handleZoomIn = useCallback(() => {
    setZoomIndex((i) => Math.min(i + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handlePublish = useCallback(async () => {
    setPublishState('publishing');
    try {
      const success = await onPublish();
      setPublishState(success ? 'success' : 'error');
    } catch {
      setPublishState('error');
    }
  }, [onPublish]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(() => {
      setPublishState('review');
      setZoomIndex(2);
    }, 300);
  }, [onOpenChange]);

  useEffect(() => {
    if (publishState !== 'success' || !open) return;
    const timer = setTimeout(() => {
      if (open) handleClose();
    }, 1000);
    return () => clearTimeout(timer);
  }, [publishState, open, handleClose]);

  const patientInfoParts = [patientAge, patientSex].filter(Boolean).join(', ');
  const patientDisplay = patientName
    ? `${patientName} ${patientInfoParts}`
    : patientInfoParts || '—';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xl sm:max-w-xl h-[calc(100vh-10rem)] p-0 gap-0 flex flex-col border-none overflow-hidden [&>button]:hidden rounded-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Review document</DialogTitle>
          <DialogDescription>Review and publish your document</DialogDescription>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#D1D1D1]">
          <h2 className="text-base font-medium text-[#1A1A1A]">Review document</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-md hover:bg-[#F5F5F5] cursor-pointer transition-colors"
          >
            <X className="w-5 h-5 text-[#767676]" />
          </button>
        </div>

        {/* Patient & note info */}
        <div className="flex gap-8 px-5 py-3 border-b border-[#D1D1D1]">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[#767676]">Patient</span>
            <span className="text-sm text-[#1A1A1A]">{patientDisplay}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[#767676]">Note type</span>
            <span className="text-sm text-[#1A1A1A]">{noteType || '—'}</span>
          </div>
        </div>

        {/* Content area */}
        <div className="bg-[#F5F5F5] flex-1 overflow-y-auto flex flex-col">
          {publishState === 'review' && (
            <ReviewContent
              previewHtml={previewHtml}
              zoomLevel={zoomLevel}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              canZoomIn={zoomIndex < ZOOM_LEVELS.length - 1}
              canZoomOut={zoomIndex > 0}
            />
          )}
          {publishState === 'publishing' && (
            <StatusContent
              icon={<Loader2 className="w-10 h-10 text-primary animate-spin" />}
              title="Publishing to Eka EMR..."
              subtitle={`Syncing ${noteType} for ${patientName || 'patient'}`}
            />
          )}
          {publishState === 'success' && (
            <StatusContent
              icon={
                <div className="w-10 h-10 rounded-full bg-green-10 flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
              }
              title="Published successfully"
              subtitle={`${noteType} for ${patientName || 'patient'} have been synced to Eka EMR.`}
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 mt-3 cursor-pointer text-primary"
                onClick={handleClose}
              >
                <ChevronLeft className="w-4 h-4" />
                Back to session
              </Button>
            </StatusContent>
          )}
          {publishState === 'error' && (
            <StatusContent
              icon={<TriangleAlert className="w-10 h-10 text-[#EF4444]" />}
              title="Couldn't publish"
              subtitle="Failed to sync with Eka EMR. Please try again."
            >
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" className="gap-1.5 cursor-pointer" onClick={handlePublish}>
                  <RotateCcw className="w-4 h-4" />
                  Try again
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 cursor-pointer"
                  onClick={handleClose}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to session
                </Button>
              </div>
            </StatusContent>
          )}
        </div>

        {/* Footer — only in review state */}
        {publishState === 'review' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#D1D1D1] shrink-0">
            <div className="flex flex-col items-center gap-1 whitespace-nowrap">
              <span className="text-xs text-[#767676]">Publishing to</span>
              <Badge
                variant="outline"
                className="text-xs font-semibold text-[#15803D] bg-[#ECFDF4]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
                Eka EMR
              </Badge>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0 cursor-pointer" onClick={handlePublish}>
              Publish
              <ArrowUp className="w-4 h-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewContent({
  previewHtml,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}: {
  previewHtml: string;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [contentHeight, setContentHeight] = useState(200);
  const [fitScale, setFitScale] = useState(1);

  useEffect(() => {
    if (containerRef.current) {
      const availableWidth = containerRef.current.clientWidth - 32;
      setFitScale(Math.min(1, availableWidth / A4_WIDTH_PX));
    }
  }, []);

  const effectiveScale = fitScale * (zoomLevel / 100);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !previewHtml) return;

    setIframeReady(false);
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(previewHtml);
      doc.close();
    }

    const onLoad = () => {
      const body = iframe.contentDocument?.body;
      if (body) {
        const h = body.scrollHeight;
        iframe.style.height = `${h}px`;
        setContentHeight(h);
      }
      setIframeReady(true);
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [previewHtml]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto p-4">
        <div
          style={{
            width: `${A4_WIDTH_PX * effectiveScale}px`,
            height: `${contentHeight * effectiveScale}px`,
            overflow: 'hidden',
          }}
        >
          <div
            className={`bg-white rounded-lg shadow-sm overflow-hidden transition-opacity duration-200 ${
              iframeReady ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              width: `${A4_WIDTH_PX}px`,
              transform: `scale(${effectiveScale})`,
              transformOrigin: 'top left',
            }}
          >
            <iframe
              ref={iframeRef}
              className="border-0"
              style={{
                width: `${A4_WIDTH_PX}px`,
                minHeight: '200px',
                pointerEvents: 'none',
              }}
              title="Document preview"
            />
          </div>
        </div>
      </div>
      {/* Zoom controls */}
      <div className="flex items-center justify-center py-2">
        <div className="inline-flex items-center gap-1 border border-[#D1D1D1] rounded-lg bg-white px-1">
          <button
            onClick={onZoomOut}
            disabled={!canZoomOut}
            className="p-2 border-r border-[#D1D1D1] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F5F5F5] transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-[#1A1A1A] px-1">{zoomLevel}%</span>
          <button
            onClick={onZoomIn}
            disabled={!canZoomIn}
            className="p-2 border-l border-[#D1D1D1] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F5F5F5] transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusContent({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-3 text-center">
      {icon}
      <div className="flex flex-col space-y-1">
        <h3 className="text-lg font-medium text-[#1A1A1A]">{title}</h3>
        <p className="text-sm text-[#767676] text-balance">{subtitle}</p>
      </div>

      {children}
    </div>
  );
}
