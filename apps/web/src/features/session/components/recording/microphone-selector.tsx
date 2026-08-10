'use client';

import { useEffect, useState, useRef } from 'react';
import useVoice2RxStore from '@/store/store';
import { Mic, MicOff, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@ui/src/shadcn-ui/lib/utils';
import { useMicrophonePermission } from '@/features/session/hooks/recording/use-microphone-permission';
import { getPlatform } from '@/platform';

interface MicrophoneSelectorProps {
  disabled?: boolean;
  className?: string;
}

export function MicrophoneSelector({ disabled = false, className }: MicrophoneSelectorProps) {
  const [microphones, setMicrophones] = useState<{ label: string; deviceId: string }[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedMicrophone = useVoice2RxStore((s) => s.selectedMicrophone);
  const setSelectedMicrophone = useVoice2RxStore((s) => s.setSelectedMicrophone);

  const { checkMicrophonePermission } = useMicrophonePermission({
    screen_name: 'start_session',
  });

  const enumerateMicrophones = async () => {
    try {
      const audio = getPlatform().audioCapture;
      if (!audio) return;
      const audioInputs = await audio.enumerateInputs();
      const permissionGranted = audioInputs.some((d) => d.label !== '');
      setHasPermission(permissionGranted);

      if (permissionGranted) {
        const mics = audioInputs.filter((d) => d.deviceId && d.deviceId !== 'default');
        setMicrophones(mics);

        const currentSelected = useVoice2RxStore.getState().selectedMicrophone;
        const isAvailable = mics.some((m) => m.deviceId === currentSelected?.deviceId);
        if (!isAvailable && mics.length > 0) {
          setSelectedMicrophone({ deviceId: mics[0].deviceId, label: mics[0].label });
        }
      }
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  };

  useEffect(() => {
    enumerateMicrophones();
    const audio = getPlatform().audioCapture;
    const unsubDevices = audio?.onDevicesChanged(enumerateMicrophones);
    const unsubPermission = audio?.onPermissionChange(enumerateMicrophones);
    return () => {
      unsubDevices?.();
      unsubPermission?.();
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const requestPermission = async () => {
    const granted = await checkMicrophonePermission();
    if (granted) {
      await enumerateMicrophones();
    }
  };

  if (hasPermission === false) {
    return (
      <div
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5 bg-[#FFF3CD] border border-[#CCCCCC] rounded-lg cursor-pointer',
          className
        )}
        onClick={requestPermission}
      >
        <MicOff className="w-4 h-4 text-[#B45309] shrink-0" />
        <span className="text-sm text-[#B45309] flex-1">No microphone access</span>
      </div>
    );
  }

  const isDisabled = disabled;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        onClick={() => {
          if (!isDisabled && microphones.length > 0) {
            setOpen((p) => !p);
          }
        }}
        disabled={isDisabled}
        className={cn(
          'w-56 flex items-center gap-2 px-3 h-10 bg-white border border-[#D1D1D1] rounded-lg cursor-pointer',
          isDisabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <Mic className="w-4 h-4 text-foreground shrink-0" />
        <span className="flex-1 min-w-0 text-sm text-foreground text-left truncate">
          {selectedMicrophone?.label || 'Select Microphone'}
        </span>
        {microphones.length > 0 && (
          <ChevronsUpDown
            className={cn(
              'w-4 h-4 text-foreground shrink-0 transition-transform duration-150',
              open && 'rotate-180'
            )}
          />
        )}
      </button>

      {open && microphones.length > 0 && (
        <div className="w-56 absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg z-20 shadow-md overflow-hidden">
          {microphones.map((mic) => {
            const isSelected = selectedMicrophone?.deviceId === mic.deviceId;
            return (
              <button
                key={mic.deviceId}
                onClick={() => {
                  setSelectedMicrophone({ deviceId: mic.deviceId, label: mic.label });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-accent text-left cursor-pointer"
              >
                <span className="flex-1 truncate">{mic.label}</span>
                {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
