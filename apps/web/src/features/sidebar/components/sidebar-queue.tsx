'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Mic, MoreVertical } from 'lucide-react';
import CheckCircleFillIcon from '@/assets/check-circle-fill-icon';
import { toast } from 'sonner';
import { useRouter, usePathname } from 'next/navigation';
import useVoice2RxStore from '@/store/store';
import { TQueueAppointment } from '@/features/sidebar/hooks/use-queue-appointments';
import { usePatientBulkInfo, TPatientInfo } from '@/features/patient/hooks/use-patient-bulk-info';
import { formatDate } from '@/utils/format-date-time';
import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';
import { useIntersectionObserver } from '@/shared-hooks/use-intersection-observer';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Button,
} from '@ui/src';
import { getOngoingSessionStatus } from '@/features/session/utils/get-ongoing-session-processing-status';
import { useQueueRecording } from '@/features/sidebar/hooks/use-queue-recording';
import { useJumpToSelected } from '@/features/sidebar/hooks/use-jump-to-selected';
import JumpToSelectedChip from '@/features/sidebar/components/jump-to-selected-chip';
import { SESSION_PHASE } from '@/constants/enums';

const INITIAL_COUNT = 7;
const LOAD_MORE_COUNT = 10;

// Combined type for rendering
type TQueueItem = TQueueAppointment & {
  patientInfo?: TPatientInfo;
};

import { getInitials } from '@/utils/shared-helpers';

interface SidebarQueueProps {
  appointments: TQueueAppointment[];
  loading: boolean;
  error: string | null;
  isDoctorSelected: boolean;
}

const SidebarQueue = ({
  appointments,
  loading: appointmentsLoading,
  error: appointmentsError,
  isDoctorSelected,
}: SidebarQueueProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const clearStore = useVoice2RxStore((state) => state.clearStore);
  const clearRecordingSessionId = useVoice2RxStore((state) => state.clearRecordingSessionId);
  const setSidebarActiveTab = useVoice2RxStore((state) => state.setSidebarActiveTab);
  const setPendingQueuePatient = useVoice2RxStore((state) => state.setPendingQueuePatient);
  const setQueueRecordingPatientOid = useVoice2RxStore(
    (state) => state.setQueueRecordingPatientOid
  );
  const ongoingPatientDetails = useVoice2RxStore(
    (state) =>
      state.sessionV2ContentById[state.sessionV2Ongoing.recording_session_id]?.patient_details ??
      null
  );
  const completedQueuePatients = useVoice2RxStore((state) => state.completedQueuePatients);
  const v2Phase = useVoice2RxStore(
    (state) => state.sessionV2ContentById[state.sessionV2Ongoing.recording_session_id]?.phase
  );
  const ongoingPatientOid = useVoice2RxStore((state) => {
    const sid = state.sessionV2Ongoing.recording_session_id;
    return sid ? state.sessionV2ContentById[sid]?.patient_details?.oid : undefined;
  });
  const queueRecordingPatientOid = useVoice2RxStore((state) => state.queueRecordingPatientOid);

  const isAnySessionBusy =
    v2Phase === SESSION_PHASE.RECORDING ||
    v2Phase === SESSION_PHASE.PAUSED ||
    v2Phase === SESSION_PHASE.PROCESSING;

  const { startQueueRecording, endVisit } = useQueueRecording();

  // Patient info fetching
  const { fetchPatients } = usePatientBulkInfo();

  // "View more" state: how many items are currently visible
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_COUNT);
  const [allPatients, setAllPatients] = useState<Map<string, TPatientInfo>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPatientDataReady, setIsPatientDataReady] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Ref for scrolling into view after "View more"
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Track previous visible count to know when to scroll
  const prevVisibleCountRef = useRef(visibleCount);

  // Get visible appointments (from start to visibleCount)
  const visibleAppointments = useMemo(() => {
    return appointments.slice(0, visibleCount);
  }, [appointments, visibleCount]);

  const hasMore = visibleCount < appointments.length;

  // Initialize when appointments load
  useEffect(() => {
    if (appointments.length > 0 && !isInitialized) {
      setIsInitialized(true);
    }
  }, [appointments, isInitialized]);

  // Fetch patient info for visible appointments
  useEffect(() => {
    const fetchVisiblePatients = async () => {
      if (appointmentsLoading) return;

      if (visibleAppointments.length === 0) {
        setIsPatientDataReady(true);
        return;
      }

      // Only fetch patients we don't already have
      const missingOids = visibleAppointments
        .map((apt) => apt.patient_oid)
        .filter(Boolean)
        .filter((oid) => !allPatients.has(oid));

      if (missingOids.length === 0) {
        setIsPatientDataReady(true);
        setIsLoadingMore(false);
        return;
      }

      if (!isLoadingMore) {
        setIsPatientDataReady(false);
      }

      const patients = await fetchPatients(missingOids);
      setAllPatients((prev) => {
        const next = new Map(prev);
        patients.forEach((patient) => {
          next.set(patient.oid, patient);
        });
        return next;
      });
      setIsPatientDataReady(true);
      setIsLoadingMore(false);
    };

    fetchVisiblePatients();
  }, [visibleAppointments, fetchPatients, appointmentsLoading]);

  // Scroll to newly loaded items after "View more"
  useEffect(() => {
    if (prevVisibleCountRef.current < visibleCount && scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevVisibleCountRef.current = visibleCount;
  }, [visibleCount, isPatientDataReady]);

  // Combine appointments with patient info
  const queueItems: TQueueItem[] = useMemo(() => {
    return visibleAppointments.map((apt) => ({
      ...apt,
      patientInfo: allPatients.get(apt.patient_oid),
    }));
  }, [visibleAppointments, allPatients]);

  // Split into active and completed groups
  const { activeItems, completedItems } = useMemo(() => {
    const active: TQueueItem[] = [];
    const completed: TQueueItem[] = [];
    for (const item of queueItems) {
      if (item.status === 'CM' || item.status === 'CMNP') {
        completed.push(item);
      } else {
        active.push(item);
      }
    }
    return { activeItems: active, completedItems: completed };
  }, [queueItems]);

  // "View more" handler
  const handleViewMore = () => {
    setIsLoadingMore(true);
    setVisibleCount((prev) => Math.min(prev + LOAD_MORE_COUNT, appointments.length));
  };

  const isSessionPath = pathname === '/new-session' || pathname.startsWith('/session/');
  const activeItemOid = isSessionPath
    ? ongoingPatientDetails?.oid ?? (isAnySessionBusy ? ongoingPatientOid : undefined) ?? null
    : null;

  const { scrollBodyRef, showChip, direction, jumpToSelected } = useJumpToSelected(
    activeItemOid,
    queueItems
  );

  const sentinelRef = useIntersectionObserver({
    onIntersect: handleViewMore,
    enabled: hasMore && !isLoadingMore,
    root: scrollBodyRef.current,
    rootMargin: '0px',
    threshold: 0.1,
  });

  // Patient click handler
  const handlePatientClick = (item: TQueueItem) => {
    const isCompleted =
      completedQueuePatients.includes(item.patient_oid) ||
      item.status === 'CM' ||
      item.status === 'CMNP' ||
      (queueRecordingPatientOid === item.patient_oid && v2Phase === SESSION_PHASE.OUTPUT);

    if (isCompleted) {
      const name = item.patientInfo?.fullName || item.patientInfo?.firstName || 'Patient';
      toast.info(`Patient ${name}'s visit has ended`);
      return;
    }

    // If this patient has an active session, navigate back to it
    if (
      isAnySessionBusy &&
      (queueRecordingPatientOid === item.patient_oid || ongoingPatientOid === item.patient_oid)
    ) {
      router.push('/new-session');
      return;
    }

    if (isAnySessionBusy) return;

    // Store patient info before clearStore — both are preserved across clearStore
    if (item.patientInfo) {
      setPendingQueuePatient({
        oid: item.patient_oid,
        username: item.patientInfo.fullName || item.patientInfo.firstName,
        age: item.patientInfo.age,
        biologicalSex: item.patientInfo.gender,
      });
    }
    setQueueRecordingPatientOid(item.patient_oid);

    clearStore();
    clearRecordingSessionId();
    setSidebarActiveTab('my_queue');

    // Navigate to /new-session where createSession picks up pendingQueuePatient
    router.push('/new-session');
  };

  const handleMicClick = (e: React.MouseEvent, item: TQueueItem) => {
    e.stopPropagation();
    startQueueRecording(item);
  };

  const handleEndVisit = (e: React.MouseEvent, item: TQueueItem) => {
    e.stopPropagation();
    endVisit(item.id, item.patient_oid);
  };

  if (!isDoctorSelected) {
    return (
      <div className="flex flex-col gap-1 px-3 pt-4">
        <p className="text-sm font-semibold text-[#1A1A1A]">No doctor selected</p>
        <p className="text-sm font-normal text-[#767676]">
          Select a clinic and doctor to view their queue.
        </p>
      </div>
    );
  }

  // Loading state - wait for both appointments AND patient data
  if (appointmentsLoading || !isPatientDataReady) {
    return (
      <div className="p-4 text-center">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
          <span className="ml-2 text-xs text-muted-foreground">Loading queue...</span>
        </div>
      </div>
    );
  }

  // Error state - only block on appointments error, not patient info
  if (appointmentsError) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-destructive">{appointmentsError}</p>
      </div>
    );
  }

  // Empty state
  if (appointments.length === 0) {
    return (
      <div className="flex flex-col gap-4 px-3 pt-4">
        <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#767676]">
          Today's queue
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-balance text-[#1A1A1A]">
            No patients in queue
          </p>
          <p className="text-sm font-normal text-balance text-[#767676]">
            Your consultation queue is currently empty.
          </p>
        </div>
      </div>
    );
  }

  const renderQueueCard = (item: TQueueItem, index: number) => {
    const displayName = item.patientInfo?.fullName || item.patientInfo?.firstName || 'Loading...';
    const { time: displayTime } = formatDate(item.full_date.toISOString());
    const initials = getInitials(item.patientInfo?.fullName || item.patientInfo?.firstName);

    // Check if this patient's session is completed (via store, Firebase status, or current session phase)

    const isSessionCompleted =
      completedQueuePatients.includes(item.patient_oid) ||
      (queueRecordingPatientOid === item.patient_oid && v2Phase === SESSION_PHASE.OUTPUT);

    const isFirebaseCompleted = item.status === 'CM' || item.status === 'CMNP';

    const isCompleted = isSessionCompleted || isFirebaseCompleted;

    const isThisPatientRecording =
      !isFirebaseCompleted &&
      (queueRecordingPatientOid === item.patient_oid ||
        (isAnySessionBusy && ongoingPatientOid === item.patient_oid));
    const isThisPatientActiveRecording = isThisPatientRecording && isAnySessionBusy;
    const isThisPatientAnalysing = isThisPatientRecording && v2Phase === SESSION_PHASE.PROCESSING;
    const showStatusIndicator = isThisPatientActiveRecording || isThisPatientAnalysing;

    const isSelected =
      !isFirebaseCompleted &&
      isSessionPath &&
      (ongoingPatientDetails?.oid === item.patient_oid ||
        (isAnySessionBusy && ongoingPatientOid === item.patient_oid));

    // Get recording status for this card
    // Map V2 phase to status string for getOngoingSessionStatus
    const phaseToStatus: Record<string, string> = {
      [SESSION_PHASE.RECORDING]: 'recording',
      [SESSION_PHASE.PAUSED]: 'paused',
      [SESSION_PHASE.PROCESSING]: 'analysing',
      [SESSION_PHASE.IDLE]: 'initialized',
      [SESSION_PHASE.OUTPUT]: 'success',
      [SESSION_PHASE.ERROR]: 'system_failure',
    };
    const recordingStatus = isThisPatientRecording
      ? getOngoingSessionStatus({ processingStatus: phaseToStatus[v2Phase] || v2Phase })
      : null;

    // Mic should be disabled if any recording is active (from queue or elsewhere)
    const isMicDisabled = isAnySessionBusy || isCompleted;

    // Card is disabled when another patient is recording (not this one)
    const isCardDisabled = isAnySessionBusy && !isThisPatientRecording;

    // Place scroll anchor at the first item of the newly loaded batch
    const isScrollAnchor = index === prevVisibleCountRef.current - LOAD_MORE_COUNT;

    const ageMeta = [
      item.patientInfo?.age ? `${item.patientInfo.age}` : null,
      item.patientInfo?.gender ? item.patientInfo.gender.charAt(0).toUpperCase() : null,
    ]
      .filter(Boolean)
      .join(', ');

    return (
      <div
        key={item.id}
        ref={isScrollAnchor ? scrollAnchorRef : undefined}
        data-jump-active={isSelected || undefined}
        className={`relative flex items-center gap-2 px-3 py-2 transition-colors ${
          isCardDisabled ? 'cursor-default' : 'cursor-pointer'
        } ${isSelected ? 'bg-[#E9EFFF]' : isCardDisabled ? '' : 'hover:bg-[#F5F5F5]'}`}
        onClick={() => handlePatientClick(item)}
      >
        {/* Profile Circle Avatar */}
        <div className="w-8 h-8 rounded-full bg-[#BFDBFE] flex items-center justify-center shrink-0 text-sm font-medium text-primary">
          {initials}
        </div>

        {/* Card content */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <p className="text-xs truncate leading-4 font-medium min-w-0">
            <span className="capitalize text-[#1A1A1A]">{displayName}</span>
            {ageMeta && <span className="text-[#767676]"> {ageMeta}</span>}
          </p>
          <div className="flex items-center gap-1.5 min-w-0">
            {item.patientInfo?.username && (
              <span className="text-[10px] leading-4 font-medium text-secondary-foreground shadow-xs bg-amber-200 rounded px-1 py-px whitespace-nowrap shrink-0">
                {item.patientInfo.username}
              </span>
            )}
            <p className="text-xs leading-4 text-[#767676] truncate">
              {showStatusIndicator && recordingStatus ? recordingStatus.label : displayTime}
            </p>
          </div>
        </div>

        {/* Right side: status/mic/actions */}
        <div className="shrink-0 flex items-center gap-1 justify-end">
          {/* Recording/analysing status indicator */}
          {showStatusIndicator && recordingStatus?.icon && (
            <CustomTooltip>
              <CustomTooltipTrigger asChild>
                <div className="shrink-0 w-4.5 h-4.5 flex items-center justify-center">
                  {recordingStatus.icon}
                </div>
              </CustomTooltipTrigger>
              <CustomTooltipContent>{recordingStatus.label}</CustomTooltipContent>
            </CustomTooltip>
          )}

          {/* Completed green circle */}
          {isCompleted && !isThisPatientActiveRecording && (
            <CustomTooltip>
              <CustomTooltipTrigger asChild>
                <div className="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                  <CheckCircleFillIcon color="#039855" size={20} />
                </div>
              </CustomTooltipTrigger>
              <CustomTooltipContent>
                {item.status === 'CM' || item.status === 'CMNP' ? 'Visit ended' : 'Session ended'}
              </CustomTooltipContent>
            </CustomTooltip>
          )}

          {/* Mic icon - shown when not completed and not actively recording/analysing this patient */}
          {!isCompleted && !showStatusIndicator && (
            <CustomTooltip>
              <CustomTooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={`size-7 cursor-pointer border-[#D1D1D1] bg-white ${
                    isMicDisabled ? 'opacity-40 pointer-events-none' : ''
                  }`}
                  onClick={(e) => handleMicClick(e, item)}
                  disabled={isMicDisabled}
                >
                  <Mic className="size-4 text-green-10" strokeWidth={1.5} />
                </Button>
              </CustomTooltipTrigger>
              <CustomTooltipContent>
                {isMicDisabled ? 'Recording in progress' : 'Start recording'}
              </CustomTooltipContent>
            </CustomTooltip>
          )}

          {/* Three dots - hidden for firebase completed patients */}
          {!isFirebaseCompleted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="cursor-pointer p-0.5 rounded-sm hover:bg-accent">
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="start"
                sideOffset={4}
                className="min-w-40 rounded-md border-[#D1D1D1] p-1 shadow-md"
              >
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-sm font-normal text-[#D92D20] focus:text-[#D92D20]"
                  onClick={(e) => handleEndVisit(e, item)}
                >
                  End visit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {isSelected && <div className="w-1 h-8 rounded-sm bg-primary" />}
      </div>
    );
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* Queue List */}
      <div className="flex-1 overflow-y-auto" ref={scrollBodyRef}>
        {/* Active patients */}
        {activeItems.map((item, index) => renderQueueCard(item, index))}

        {/* Completed divider */}
        {completedItems.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#767676]">
              Completed
            </span>
            <div className="flex-1 h-px bg-[#E5E5E5]" />
          </div>
        )}

        {/* Completed patients */}
        {completedItems.map((item, index) => renderQueueCard(item, activeItems.length + index))}

        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-2">
            {isLoadingMore && (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary" />
            )}
          </div>
        )}
      </div>

      {showChip && <JumpToSelectedChip direction={direction} onClick={jumpToSelected} />}
    </div>
  );
};

export default SidebarQueue;
