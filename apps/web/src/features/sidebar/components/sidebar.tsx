'use client';

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  Button,
  SidebarContent,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@ui/src';

import {
  ChevronRight,
  ChevronLeft,
  Crown,
  Plus,
  LayoutTemplate,
  Settings,
  BellDot,
  Zap,
  Download,
  CircleHelp,
  LogOut,
  CreditCard,
  ArrowLeftRight,
  MessageSquareMore,
  Bug,
  RefreshCw,
  Check,
} from 'lucide-react';
import { SidebarLogo } from '@/assets/sidebar-logo';
import EkaLogoCollapsible from '../../../../public/assets/eka-logo-collapsible.svg';
import SidebarPastSessions from './sidebar-past-sessions';
import SidebarQueue from './sidebar-queue';
import SidebarSearchBar from './sidebar-search-bar';
import { useRouter } from 'next/navigation';
import useVoice2RxStore from '@/store/store';
import { getPlatform, getStorage, Capability, useWhatsApp, useAppUpdates, useCapabilities, WebOnly, DesktopOnly } from '@/platform';
import WhatsAppSetupDialog from '@/features/integrations/components/whatsapp-setup-dialog';
import RxAutoSendListener from '@/features/sidebar/components/rx-auto-send-listener';
import WhatsAppIcon from '@/features/integrations/components/whatsapp-icon';
import { useSidebar } from '@ui/src';
import { usePastSessionsHistory } from '@/features/sidebar/hooks/use-past-session-history';
import { useSessionLifecycle } from '@/features/session/hooks/use-session-lifecycle';
import { tracker } from '@/analytics';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import { handleUserLogout } from '@/utils/user-auth-logout-utility-methods';
import { SWITCH_WORKSPACE_PROD_URL, SWITCH_WORKSPACE_DEV_URL } from '@/constants/constant';
import UserDefaultsDialog from '@/features/settings/components/user-defaults-dialog';
import EkaLogoDesktop from '../../../../public/assets/eka-logo-desktop.svg';
import { SESSION_PHASE } from '@/constants/enums';
import { useSessionFilterSort } from '@/features/sidebar/hooks/use-session-filter-sort';
import { useQueueAppointments } from '@/features/sidebar/hooks/use-queue-appointments';
import { useQueueFilter } from '@/features/sidebar/hooks/use-queue-filter';
import { useEmrConfiguration } from '@/features/sidebar/hooks/use-emr-configuration';
import QueueSelectors from '@/features/sidebar/components/queue-selectors';
import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';
import { SidebarBottomPanel, SidebarPanelItem } from './sidebar-bottom-panel';
import SidebarPromoBanner from './sidebar-promo-banner';

const CustomSidebar = () => {
  const {
    sessions,
    loading: sessionsLoadingState,
    loadingMore: sessionsLoadingMoreState,
    error: sessionsErrorState,
    hasNextPage,
    goToNextPage,
    searchQuery,
    setSearchQuery,
    isSearching,
    refreshSessions,
    removeSession,
  } = usePastSessionsHistory({
    initialBatchSize: 10,
    loadMoreBatchSize: 10,
    pageSize: 10,
  });

  const pathname = usePathname();
  const loggedInUserDetails = useVoice2RxStore((state) => state.loggedInUserDetails);
  const activeTab = useVoice2RxStore((state) => state.sidebarActiveTab);
  const setActiveTab = useVoice2RxStore((state) => state.setSidebarActiveTab);
  const { state, setOpen } = useSidebar();
  const [permanentState, setPermanentState] = useState<'expanded' | 'collapsed'>(state);
  const isRecordsTabActive = useVoice2RxStore((state) => state.isRecordsTabActive);
  const isVitalsGridOpen = useVoice2RxStore((state) => state.isVitalsGridOpen);
  const permanentStateRef = useRef(permanentState);
  permanentStateRef.current = permanentState;
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  useEffect(() => {
    if (isRecordsTabActive && isVitalsGridOpen && permanentStateRef.current === 'expanded') {
      setPermanentState('collapsed');
      setOpenRef.current(false);
    } else if (!isRecordsTabActive && permanentStateRef.current === 'collapsed') {
      setPermanentState('expanded');
      setOpenRef.current(true);
    }
  }, [isRecordsTabActive, isVitalsGridOpen]);

  const v2SessionId = useVoice2RxStore((state) => state.sessionV2Ongoing.recording_session_id);
  const newSessionId = useVoice2RxStore((state) => state.newSessionId);
  const v2Phase = useVoice2RxStore(
    (state) => state.sessionV2ContentById[state.sessionV2Ongoing.recording_session_id]?.phase
  );
  const v2IsLimitExceeded = useVoice2RxStore(
    (state) =>
      state.sessionV2ContentById[state.sessionV2Ongoing.recording_session_id]?.is_limit_exceeded ??
      false
  );
  const v2PatientDetails = useVoice2RxStore(
    (state) =>
      state.sessionV2ContentById[state.sessionV2Ongoing.recording_session_id]?.patient_details ??
      null
  );
  const queueRecordingPatientOid = useVoice2RxStore((state) => state.queueRecordingPatientOid);
  const { createSession } = useSessionLifecycle();
  // Two paths open this dialog:
  // 1. sessionStorage (set by SectionContainer when ?modal=user-defaults arrives)
  //    — survives redirects through /onboarding where sidebar unmounts
  // 2. URL search param (handled in useEffect below)
  // Cleared ONLY when user dismisses the dialog (onOpenChange → false).
  const [isUserDefaultsOpen, setIsUserDefaultsOpen] = useState(() => {
    return getStorage().session.get('ekascribe:pending-modal') === 'user-defaults';
  });

  const [activePanel, setActivePanel] = useState<'profile' | 'help' | null>(null);
  const [whatsappSetupOpen, setWhatsappSetupOpen] = useState(false);
  const whatsapp = useWhatsApp();
  const [whatsappStatus, setWhatsappStatus] = useState<string>('disconnected');
  const [whatsappStatusLoaded, setWhatsappStatusLoaded] = useState(false);

  useEffect(() => {
    if (!whatsapp) return;
    whatsapp.getStatus().then((r) => {
      setWhatsappStatus(r.status);
      setWhatsappStatusLoaded(true);
    }).catch(() => { setWhatsappStatusLoaded(true); });
    return whatsapp.onStatusChange((s) => setWhatsappStatus(s));
  }, [whatsapp]);

  const appUpdates = useAppUpdates();
  const [updatePhase, setUpdatePhase] = useState<'available' | 'downloading' | 'ready' | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [waBannerDismissed, setWaBannerDismissed] = useState(
    () => getStorage().local.get('wa_promo_banner_dismissed') === 'true',
  );

  useEffect(() => {
    if (!appUpdates) return;
    const unsubAvail = appUpdates.onUpdateAvailable((info) => {
      setUpdateVersion(info.version);
      setUpdatePhase('available');
    });
    const unsubProg = appUpdates.onUpdateProgress((info) => {
      setUpdateProgress(info.percent);
      setUpdatePhase('downloading');
    });
    const unsubReady = appUpdates.onUpdateReady(() => setUpdatePhase('ready'));
    return () => { unsubAvail(); unsubProg(); unsubReady(); };
  }, [appUpdates]);

  const capabilities = useCapabilities();
  const whatsappConnected = whatsappStatus === 'connected';
  const showWhatsAppBanner =
    capabilities.has('whatsapp-linked-device') &&
    !whatsappConnected &&
    whatsappStatusLoaded &&
    !waBannerDismissed;
  const selectedClinicId = useVoice2RxStore((state) => state.selectedQueueClinicId);
  const setSelectedClinicId = useVoice2RxStore((state) => state.setSelectedQueueClinicId);
  const selectedDoctorId = useVoice2RxStore((state) => state.selectedQueueDoctorId);
  const setSelectedDoctorId = useVoice2RxStore((state) => state.setSelectedQueueDoctorId);

  const footerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const unsub = getPlatform().system?.onOpenUserDefaults?.(() => setIsUserDefaultsOpen(true));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const unsub = getPlatform().system?.onLogout?.(() => void handleUserLogout());
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!activePanel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (footerRef.current && !footerRef.current.contains(e.target as Node)) {
        setActivePanel(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activePanel]);

  useEffect(() => {
    const modal = searchParams.get('modal');
    if (!modal) return;

    if (modal === 'user-defaults') {
      setIsUserDefaultsOpen(true);
    } else if (modal === 'crisp-chat') {
      window.$crisp?.push(['do', 'chat:show']);
      window.$crisp?.push(['do', 'chat:open']);
    }

    const params = new URLSearchParams(window.location.search);
    params.delete('modal');
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [searchParams]);

  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);
  const [isRefreshingSessions, setIsRefreshingSessions] = useState(false);
  const router = useRouter();
  const [isStartingNewSession, setIsStartingNewSession] = useState(false);
  const isStartingNewSessionRef = useRef(false);

  const isSessionActive = v2Phase === SESSION_PHASE.RECORDING || v2Phase === SESSION_PHASE.PAUSED;

  // Broader check: session is still ongoing (recording, paused, or processing).
  // Excludes output/error because by then the API processing_status reflects the
  // final state and the stale recording_session_id
  // would cause click-redirect issues.
  const isPastSessionOngoing =
    v2Phase === SESSION_PHASE.RECORDING ||
    v2Phase === SESSION_PHASE.PAUSED ||
    v2Phase === SESSION_PHASE.PROCESSING;

  // Block switching to Sessions tab when a queue recording is active
  const isSessionsTabDisabled = !!(queueRecordingPatientOid && isSessionActive);

  const handleCurrentSessionClick = useCallback(() => {
    if (!v2SessionId) return;

    // New session (idle/recording) → /new-session, past session → /session/{id}
    const targetPath =
      v2Phase === SESSION_PHASE.IDLE ||
      v2Phase === SESSION_PHASE.RECORDING ||
      v2Phase === SESSION_PHASE.PAUSED
        ? '/new-session'
        : `/session/${v2SessionId}`;

    if (pathname === targetPath) return;
    router.push(targetPath as any);
  }, [v2SessionId, v2Phase, pathname, router]);

  const handleNewSessionClick = async () => {
    // Block when a recording is active
    if (isSessionActive) return;

    // Guard against rapid double-clicks (ref is synchronous, unlike useState)
    if (isStartingNewSessionRef.current) return;

    isStartingNewSessionRef.current = true;
    setIsStartingNewSession(true);

    tracker.track({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_SIDEBAR_CLICKS,
      type: MIXPANEL_EVENT_TYPE.NEW_SESSION,
    });

    // Refresh past sessions so the previous session appears in the list.
    await refreshSessions().catch(console.error);

    // Create up front so /new-session reuses it instead of opening the latest session.
    await createSession({ force: true });
    router.push('/new-session');

    isStartingNewSessionRef.current = false;
    setIsStartingNewSession(false);
  };

  // True when the ongoing V2 session is the one created via the new-session flow.
  // Past sessions being recorded/viewed are highlighted in the list instead.
  const isNewSession = !!v2SessionId && v2SessionId === newSessionId;

  // Ongoing session card in past sessions list.
  // Only shown for NEW sessions (not yet in past sessions list).
  const ongoingSessionData = useMemo(() => {
    if (!isNewSession || v2IsLimitExceeded) return null;

    // Map V2 phase to a status string compatible with getOngoingSessionStatus
    const phaseToStatus: Record<string, string> = {
      [SESSION_PHASE.IDLE]: 'initialized',
      [SESSION_PHASE.RECORDING]: 'recording',
      [SESSION_PHASE.PAUSED]: 'paused',
      [SESSION_PHASE.PROCESSING]: 'analysing',
      [SESSION_PHASE.OUTPUT]: 'success',
      [SESSION_PHASE.ERROR]: 'system_failure',
    };
    const displayStatus = phaseToStatus[v2Phase] || 'initialized';

    return {
      patientName: v2PatientDetails?.username || null,
      processingStatus: displayStatus,
    };
  }, [isNewSession, v2IsLimitExceeded, v2Phase, v2PatientDetails]);

  const handleRefreshSessions = async () => {
    if (!isRefreshingSessions) {
      setIsRefreshingSessions(true);
      try {
        await refreshSessions();
      } finally {
        setIsRefreshingSessions(false);
      }
    }
  };

  const handleRefreshQueue = async () => {
    if (!isRefreshingQueue) {
      setIsRefreshingQueue(true);
      try {
        queueRefetch();
      } finally {
        setIsRefreshingQueue(false);
      }
    }
  };

  const {
    filterGroupsWithCounts: sessionFilterGroups,
    filteredSessions,
    isFilterActive: isSessionFilterActive,
    sortOrder: sessionSortOrder,
    toggleFilterGroup: toggleSessionFilterGroup,
    clearFilters: clearSessionFilters,
    toggleSortOrder: toggleSessionSortOrder,
  } = useSessionFilterSort(sessions);

  // Exclude the ongoing session from the past sessions list so it doesn't
  // appear twice (once as "Current Session" and once in the date-grouped list).
  const displaySessions = useMemo(() => {
    if (!ongoingSessionData || !v2SessionId) return filteredSessions;
    return filteredSessions.filter((s) => s.txn_id !== v2SessionId);
  }, [filteredSessions, ongoingSessionData, v2SessionId]);

  const ALL_CLINICS_ID = 'all';
  const ALL_DOCTORS_ID = 'all';
  const hasInitializedQueue = useRef(false);

  const {
    clinics,
    doctors: allDoctors,
    getDoctorsForClinic,
    loading: emrLoading,
  } = useEmrConfiguration();

  const clinicOptions = useMemo(() => {
    if (clinics.length === 0) return clinics;

    return [{ id: ALL_CLINICS_ID, name: 'All Clinics', doctorIds: [] }, ...clinics];
  }, [clinics]);

  const emrConnected = !emrLoading && clinics.length > 0;

  const clinicDoctors = useMemo(() => {
    if (selectedClinicId === ALL_CLINICS_ID) return allDoctors;

    if (selectedClinicId) return getDoctorsForClinic(selectedClinicId);

    return [];
  }, [selectedClinicId, allDoctors, getDoctorsForClinic]);

  const doctorOptions = useMemo(() => {
    if (clinicDoctors.length === 0) return clinicDoctors;

    return [{ id: ALL_DOCTORS_ID, name: 'All Doctors' }, ...clinicDoctors];
  }, [clinicDoctors]);

  const isAllDoctorsSelected = selectedDoctorId === ALL_DOCTORS_ID;
  const scopedDoctorOids = useMemo(() => clinicDoctors.map((d) => d.id), [clinicDoctors]);

  // Auto-select "All Clinics" + first doctor on load; persisted values restored by Zustand
  useEffect(() => {
    if (emrLoading || clinics.length === 0 || hasInitializedQueue.current) return;
    hasInitializedQueue.current = true;

    const { selectedQueueClinicId, selectedQueueDoctorId } = useVoice2RxStore.getState();

    const isValidClinic =
      selectedQueueClinicId === ALL_CLINICS_ID ||
      clinics.some((c) => c.id === selectedQueueClinicId);
    const clinicId =
      isValidClinic && selectedQueueClinicId ? selectedQueueClinicId : ALL_CLINICS_ID;
    if (clinicId !== selectedQueueClinicId) {
      setSelectedClinicId(clinicId);
    }

    const availableDoctors =
      clinicId === ALL_CLINICS_ID ? allDoctors : getDoctorsForClinic(clinicId);
    const isValidDoctor =
      selectedQueueDoctorId &&
      (selectedQueueDoctorId === ALL_DOCTORS_ID ||
        availableDoctors.some((d) => d.id === selectedQueueDoctorId));
    if (!isValidDoctor) {
      setSelectedDoctorId(availableDoctors[0]?.id ?? null);
    }
  }, [
    emrLoading,
    clinics,
    allDoctors,
    getDoctorsForClinic,
    setSelectedClinicId,
    setSelectedDoctorId,
  ]);

  const handleClinicChange = useCallback(
    (clinicId: string | null) => {
      setSelectedClinicId(clinicId);
      const doctors =
        clinicId === ALL_CLINICS_ID ? allDoctors : clinicId ? getDoctorsForClinic(clinicId) : [];
      setSelectedDoctorId(doctors[0]?.id ?? null);
    },
    [setSelectedClinicId, setSelectedDoctorId, allDoctors, getDoctorsForClinic]
  );

  const handleDoctorChange = useCallback(
    (doctorId: string | null) => {
      setSelectedDoctorId(doctorId);
    },
    [setSelectedDoctorId]
  );

  // Queue appointments (real-time listener)
  const {
    appointments: queueAppointments,
    loading: queueLoading,
    error: queueError,
    refetch: queueRefetch,
  } = useQueueAppointments(
    isAllDoctorsSelected
      ? { doctorOids: scopedDoctorOids }
      : { doctorOidOverride: selectedDoctorId }
  );

  const {
    filterGroupsWithCounts: queueFilterGroups,
    filteredAppointments,
    isFilterActive: isQueueFilterActive,
    sortOrder: queueSortOrder,
    toggleFilterGroup: toggleQueueFilterGroup,
    clearFilters: clearQueueFilters,
    toggleSortOrder: toggleQueueSortOrder,
  } = useQueueFilter(queueAppointments);

  // Keep queue count in store for badge display
  const setQueueCount = useVoice2RxStore((state) => state.setQueueCount);
  const setRefreshQueueAppointmentsCallback = useVoice2RxStore(
    (state) => state.setRefreshQueueAppointmentsCallback
  );

  useEffect(() => {
    if (!queueLoading) {
      setQueueCount(selectedDoctorId ? queueAppointments.length : null);
    }
  }, [queueAppointments.length, queueLoading, setQueueCount, selectedDoctorId]);

  useEffect(() => {
    setRefreshQueueAppointmentsCallback(queueRefetch);
    return () => {
      setRefreshQueueAppointmentsCallback(null);
    };
  }, [queueRefetch, setRefreshQueueAppointmentsCallback]);

  const isCollapsed = permanentState === 'collapsed';

  const logo = {
    src: isCollapsed ? EkaLogoCollapsible : EkaLogoDesktop,
    alt: 'eka.care',
    className: isCollapsed ? 'w-8 h-6' : 'w-32 h-6',
  };

  // const isEkaDoc = loggedInUserDetails?.is_eka_doc || false;
  const queueCount = useVoice2RxStore((state) => state.queueCount);

  return (
    <Sidebar collapsible="icon" className="border-border">
      <Capability id="whatsapp-linked-device">
        <RxAutoSendListener />
      </Capability>
      <SidebarHeader>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-1">
            <SidebarLogo logo={logo} collapsed={true} />
            <button
              className="cursor-pointer hidden md:flex p-1 rounded hover:bg-accent transition-colors"
              onClick={() => {
                setPermanentState('expanded');
                setOpen(true);
              }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-2">
              <div className="flex items-center gap-1.5">
                <SidebarLogo logo={logo} collapsed={false} />
                {loggedInUserDetails?.is_paid_doc ? (
                  <span
                    className="text-[8px] font-semibold leading-none tracking-wide uppercase text-white rounded px-1 py-0.5"
                    style={{
                      background: 'linear-gradient(90deg, #854D0E 0%, #CA8A04 100%)',
                      borderRadius: '4px',
                      padding: '2px 4px',
                    }}
                  >
                    PRO
                  </span>
                ) : (
                  <span
                    className="text-[10px] font-semibold leading-none tracking-[0.1em] uppercase text-white rounded"
                    style={{
                      background: '#215FFF',
                      borderRadius: '4px',
                      padding: '2px 4px',
                    }}
                  >
                    FREE
                  </span>
                )}
              </div>

              <button
                className="cursor-pointer hidden md:flex p-1 rounded hover:bg-accent transition-colors"
                onClick={() => {
                  setPermanentState('collapsed');
                  setOpen(false);
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <DesktopOnly>
              <div className="px-2 pb-2 flex gap-2">
                {emrConnected && (
                  <button
                    className="flex items-center justify-center gap-1.5 flex-1 bg-muted hover:bg-accent rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                    onClick={() => router.push('/integrations?tab=emr' as any)}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500" />
                    EMR
                  </button>
                )}
                <Capability id="whatsapp-linked-device">
                  <button
                    className="flex items-center justify-center gap-1.5 flex-1 bg-muted hover:bg-accent rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                    onClick={() => router.push('/integrations?tab=apps' as any)}
                  >
                    <WhatsAppIcon className="w-3 h-3 text-[#25D366]" />
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${whatsappStatus === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`} />
                    WhatsApp
                  </button>
                </Capability>
              </div>
            </DesktopOnly>
          </>
        )}
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto">
        {!isCollapsed ? (
          // isEkaDoc ? (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as 'my_queue' | 'past_sessions')}
            className="flex flex-col h-full"
          >
            <div className="px-3">
              <TabsList className="grid w-full grid-cols-2 bg-transparent! rounded-none! p-0! h-auto! border-b border-[#D1D1D1]">
                <TabsTrigger
                  value="my_queue"
                  className="bg-transparent! rounded-none! shadow-none! border-transparent! cursor-pointer text-sm font-semibold text-[#767676] data-[state=active]:text-[#1A1A1A]! px-2 py-2 data-[state=active]:border-b-2! data-[state=active]:border-b-primary! min-w-0"
                >
                  <span className="shrink-0">Queue</span>
                  {queueCount !== null && queueCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[#D1D1D1] text-xs font-medium text-[#767676] shrink-0">
                      {queueCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="past_sessions"
                  disabled={isSessionsTabDisabled}
                  className={`bg-transparent! rounded-none! shadow-none! border-transparent! cursor-pointer text-sm font-semibold text-[#767676] data-[state=active]:text-[#1A1A1A]! px-2 py-2 data-[state=active]:border-b-2! data-[state=active]:border-b-primary! min-w-0 ${
                    isSessionsTabDisabled ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  Sessions
                </TabsTrigger>
              </TabsList>
            </div>

            {activeTab === 'my_queue' && (
              <div className="px-3 pt-2 flex flex-col gap-2">
                <QueueSelectors
                  clinics={clinicOptions}
                  doctors={doctorOptions}
                  selectedClinicId={selectedClinicId}
                  selectedDoctorId={selectedDoctorId}
                  onClinicChange={handleClinicChange}
                  onDoctorChange={handleDoctorChange}
                  loading={emrLoading}
                  disabled={!!queueRecordingPatientOid && isPastSessionOngoing}
                />
              </div>
            )}

            {activeTab === 'past_sessions' && (
              <div className="px-3 pt-2 shrink-0">
                <Button
                  variant="outline"
                  onClick={handleNewSessionClick}
                  disabled={isSessionActive || isStartingNewSession}
                  className="w-full justify-center cursor-pointer gap-2 rounded-lg border-[#D1D1D1] text-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-sm font-medium">New Session</span>
                </Button>
              </div>
            )}

            <SidebarSearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={activeTab === 'my_queue' ? 'Search queue' : 'Search sessions'}
              onRefresh={activeTab === 'my_queue' ? handleRefreshQueue : handleRefreshSessions}
              isRefreshing={activeTab === 'my_queue' ? isRefreshingQueue : isRefreshingSessions}
              filterGroups={
                activeTab === 'my_queue'
                  ? queueAppointments.length > 0
                    ? queueFilterGroups
                    : undefined
                  : sessionFilterGroups
              }
              onToggleFilterGroup={
                activeTab === 'my_queue' ? toggleQueueFilterGroup : toggleSessionFilterGroup
              }
              onClearFilters={activeTab === 'my_queue' ? clearQueueFilters : clearSessionFilters}
              isFilterActive={
                activeTab === 'my_queue' ? isQueueFilterActive : isSessionFilterActive
              }
              sortOrder={
                activeTab === 'my_queue'
                  ? queueAppointments.length > 0
                    ? queueSortOrder
                    : undefined
                  : sessionSortOrder
              }
              onSortOrderChange={
                activeTab === 'my_queue'
                  ? queueAppointments.length > 0
                    ? toggleQueueSortOrder
                    : undefined
                  : toggleSessionSortOrder
              }
            />

            <TabsContent value="my_queue" className="flex-1 overflow-y-auto mt-0">
              <SidebarQueue
                appointments={filteredAppointments}
                loading={queueLoading}
                error={queueError}
                isDoctorSelected={!!selectedDoctorId}
              />
            </TabsContent>
            <TabsContent value="past_sessions" className="flex-1 flex flex-col mt-0 min-h-0">
              <div className="flex-1 min-h-0">
                <SidebarPastSessions
                  sessions={displaySessions}
                  loading={sessionsLoadingState}
                  loadingMore={sessionsLoadingMoreState}
                  error={sessionsErrorState}
                  hasNextPage={hasNextPage}
                  goToNextPage={goToNextPage}
                  isSearching={isSearching}
                  onDeleteSession={removeSession}
                  ongoingSession={ongoingSessionData}
                  refreshPastSessions={handleRefreshSessions}
                  onCurrentSessionClick={handleCurrentSessionClick}
                  activeRecordingSessionId={
                    !isNewSession && isPastSessionOngoing ? v2SessionId : undefined
                  }
                />
              </div>
            </TabsContent>
          </Tabs>
        ) : // ) : (
        //   <div className="flex flex-col h-full">
        //     <div className="px-3 pt-2">
        //       <Button
        //         variant="outline"
        //         onClick={handleNewSessionClick}
        //         disabled={isSessionActive || isStartingNewSession}
        //         className="w-full justify-center cursor-pointer gap-2 rounded-lg border-[#D1D1D1] text-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
        //       >
        //         <Plus className="w-5 h-5" />
        //         <span className="text-sm font-medium">New Session</span>
        //       </Button>
        //     </div>
        //     <SidebarSearchBar
        //       value={searchQuery}
        //       onChange={setSearchQuery}
        //       placeholder="Search sessions"
        //       onRefresh={handleRefreshSessions}
        //       isRefreshing={isRefreshingSessions}
        //       filterGroups={sessionFilterGroups}
        //       onToggleFilterGroup={toggleSessionFilterGroup}
        //       onClearFilters={clearSessionFilters}
        //       isFilterActive={isSessionFilterActive}
        //       sortOrder={sessionSortOrder}
        //       onSortOrderChange={toggleSessionSortOrder}
        //     />
        //     <div className="flex-1 overflow-y-auto mt-0">
        //       <SidebarPastSessions
        //         sessions={displaySessions}
        //         loading={sessionsLoadingState}
        //         loadingMore={sessionsLoadingMoreState}
        //         error={sessionsErrorState}
        //         hasNextPage={hasNextPage}
        //         goToNextPage={goToNextPage}
        //         isSearching={isSearching}
        //         onDeleteSession={removeSession}
        //         ongoingSession={ongoingSessionData}
        //         onCurrentSessionClick={handleCurrentSessionClick}
        //         activeRecordingSessionId={
        //           !isNewSession && isPastSessionOngoing ? v2SessionId : undefined
        //         }
        //       />
        //     </div>
        //   </div>
        // )
        null}
      </SidebarContent>

      {/* Update / WhatsApp promo banner — desktop only, outside scroll area so it's always visible */}
      <DesktopOnly>
        {!isCollapsed && (() => {
          let bannerProps: React.ComponentProps<typeof SidebarPromoBanner> | null = null;
          if (updatePhase === 'available' && updateVersion) {
            bannerProps = {
              icon: <RefreshCw className="w-5 h-5 text-[#2563EB]" />,
              iconContainerClassName: 'bg-[#DBEAFE]',
              title: `Update v${updateVersion}`,
              titleClassName: 'text-[#1E40AF]',
              subtitle: 'New version available',
              bannerClassName: 'bg-[#EFF6FF] border border-[#BFDBFE]',
              onClick: () => appUpdates?.install(),
            };
          } else if (updatePhase === 'downloading') {
            bannerProps = {
              icon: <RefreshCw className="w-5 h-5 text-[#2563EB] animate-spin" />,
              iconContainerClassName: 'bg-[#DBEAFE]',
              title: 'Downloading update',
              titleClassName: 'text-[#1E40AF]',
              progress: updateProgress,
              bannerClassName: 'bg-[#EFF6FF] border border-[#BFDBFE]',
              onClick: () => {},
            };
          } else if (updatePhase === 'ready') {
            bannerProps = {
              icon: <Check className="w-5 h-5 text-[#16A34A]" />,
              iconContainerClassName: 'bg-[#DCFCE7]',
              title: 'Update ready',
              titleClassName: 'text-[#15803D]',
              subtitle: 'Restart to apply update',
              bannerClassName: 'bg-[#F0FDF4] border border-[#BBF7D0]',
              onClick: () => appUpdates?.install(),
            };
          } else if (showWhatsAppBanner) {
            bannerProps = {
              icon: <WhatsAppIcon className="w-5 h-5" />,
              iconContainerClassName: 'bg-[#D1FAE5]',
              title: 'Send via WhatsApp',
              badge: 'FREE',
              subtitle: 'Share notes directly with patients',
              bannerClassName: 'bg-[#ECFDF5] border border-[#A7F3D0]',
              onClick: () => router.push('/integrations?tab=apps' as any),
              onDismiss: () => {
                getStorage().local.set('wa_promo_banner_dismissed', 'true');
                setWaBannerDismissed(true);
              },
            };
          }
          return bannerProps ? <SidebarPromoBanner {...bannerProps} /> : null;
        })()}
      </DesktopOnly>

      {/* Bottom panels + icon bar */}
      <SidebarFooter className="gap-0 p-0">
        <div ref={footerRef} className="relative">
          {/* Profile panel */}
          {activePanel === 'profile' && (
            <SidebarBottomPanel
              isCollapsed={isCollapsed}
              onClose={() => setActivePanel(null)}
              header={
                <div className="flex items-center gap-2">
                  <div className="size-10 shrink-0 rounded-full bg-[#DBEAFE] flex items-center justify-center text-[#1E40AF] text-sm font-semibold">
                    {(loggedInUserDetails?.fn?.[0] || '').toUpperCase()}
                    {(loggedInUserDetails?.ln?.[0] || '').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1A1A1A] truncate">
                      {loggedInUserDetails?.s || 'Dr'}{' '}
                      {[loggedInUserDetails?.fn, loggedInUserDetails?.mn, loggedInUserDetails?.ln]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                    {loggedInUserDetails?.['w-n'] && (
                      <p className="text-xs text-[#6B7280] truncate">
                        {loggedInUserDetails['w-n']}
                      </p>
                    )}
                  </div>
                </div>
              }
            >
              <SidebarPanelItem
                icon={<Settings className="size-4 text-[#6B7280]" />}
                label="User Defaults"
                onClick={() => {
                  setIsUserDefaultsOpen(true);
                  setActivePanel(null);
                }}
              />
              {loggedInUserDetails?.is_paid_doc ? (
                <SidebarPanelItem
                  icon={<CreditCard className="size-4 text-[#6B7280]" />}
                  label="Manage Subscription"
                  onClick={() => {
                    getPlatform().system?.openExternal(
                      'https://billing.stripe.com/p/login/7sYfZj8t46BnfTvgG67ss00'
                    );
                  }}
                />
              ) : (
                <SidebarPanelItem
                  icon={<Crown className="size-4 text-[#6B7280]" />}
                  label="Upgrade to Pro"
                  onClick={() => {
                    tracker.track({
                      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_SIDEBAR_CLICKS,
                      type: MIXPANEL_EVENT_TYPE.UPGRADE,
                    });
                    router.push('/pricing');
                    setActivePanel(null);
                  }}
                  trailing={
                    <Badge variant="secondary" className="rounded-full ml-1">
                      Trial
                    </Badge>
                  }
                />
              )}
              <WebOnly>
                <SidebarPanelItem
                  icon={<ArrowLeftRight className="size-4 text-[#6B7280]" />}
                  label="Switch workspace"
                  onClick={() => {
                    const switchUrl =
                      process.env.NEXT_PUBLIC_ENV === 'PROD'
                        ? SWITCH_WORKSPACE_PROD_URL
                        : SWITCH_WORKSPACE_DEV_URL;
                    window.location.href = switchUrl;
                  }}
                />
              </WebOnly>
              <div className="border-t border-[#E5E5E5] my-1" />
              <SidebarPanelItem
                icon={<LogOut className="size-4 text-current" />}
                label="Log out"
                variant="destructive"
                onClick={() => handleUserLogout()}
              />
            </SidebarBottomPanel>
          )}

          {/* Help panel */}
          {activePanel === 'help' && (
            <SidebarBottomPanel
              isCollapsed={isCollapsed}
              onClose={() => setActivePanel(null)}
              header={<p className="text-sm font-semibold text-[#1A1A1A]">Help & Support</p>}
            >
              <SidebarPanelItem
                icon={<BellDot className="size-4 text-[#6B7280]" />}
                label="What's new"
                onClick={() => {
                  tracker.track({
                    name: MIXPANEL_EVENT_NAME.SCRIBEWEB_SIDEBAR_CLICKS,
                    type: MIXPANEL_EVENT_TYPE.WHATS_NEW,
                  });
                  getPlatform().system?.openExternal('https://ekascribe.ai/changelog');
                }}
              />
              <SidebarPanelItem
                icon={<Bug className="size-4 text-[#6B7280]" />}
                label="Report an issue"
                onClick={() => {
                  window.$crisp?.push(['do', 'chat:show']);
                  window.$crisp?.push(['do', 'chat:open']);
                }}
              />
              <SidebarPanelItem
                icon={<MessageSquareMore className="size-4 text-[#6B7280]" />}
                label="Share your feedback"
                onClick={() => {
                  window.$crisp?.push(['do', 'chat:show']);
                  window.$crisp?.push(['do', 'chat:open']);
                }}
              />
            </SidebarBottomPanel>
          )}

          {/* Bottom tab bar */}
          <div
            className={`flex items-center border-t gap-2 border-[#D1D1D1] p-3 ${
              isCollapsed ? 'flex-col' : ''
            }`}
          >
            {/* Profile */}
            <CustomTooltip>
              <CustomTooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-9 cursor-pointer rounded-lg`}
                  onClick={() => {
                    tracker.track({
                      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_SIDEBAR_CLICKS,
                      type: MIXPANEL_EVENT_TYPE.PROFILE,
                    });
                    setActivePanel(activePanel === 'profile' ? null : 'profile');
                  }}
                >
                  <span className="size-9 flex items-center justify-center rounded-md bg-gradient-to-b from-[#FEF9E7] to-[#FEF3C7] text-[#854D0E] text-xs font-semibold border border-[#F5D580]">
                    {(loggedInUserDetails?.fn?.[0] || '').toUpperCase()}
                    {(loggedInUserDetails?.ln?.[0] || '').toUpperCase()}
                  </span>
                </Button>
              </CustomTooltipTrigger>
              <CustomTooltipContent collisionPadding={8}>
                {loggedInUserDetails?.s || 'Dr'}{' '}
                {[loggedInUserDetails?.fn, loggedInUserDetails?.mn, loggedInUserDetails?.ln]
                  .filter(Boolean)
                  .join(' ')}
              </CustomTooltipContent>
            </CustomTooltip>

            {/* Templates */}
            <CustomTooltip>
              <CustomTooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-9 cursor-pointer rounded-lg ${
                    pathname.startsWith('/template')
                      ? 'text-primary'
                      : 'text-[#1A1A1A] hover:bg-[#F3F4F6]'
                  }`}
                  onClick={() => {
                    tracker.track({
                      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_SIDEBAR_CLICKS,
                      type: MIXPANEL_EVENT_TYPE.TEMPLATES,
                    });
                    setActivePanel(null);
                    router.push('/template');
                  }}
                >
                  <LayoutTemplate className="size-5" strokeWidth={1.5} />
                </Button>
              </CustomTooltipTrigger>
              <CustomTooltipContent collisionPadding={8}>Templates</CustomTooltipContent>
            </CustomTooltip>

            {/* Integrations */}
            <CustomTooltip>
              <CustomTooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-9 cursor-pointer rounded-lg ${
                    pathname.startsWith('/integrations')
                      ? 'text-primary'
                      : 'text-[#1A1A1A] hover:bg-[#F3F4F6]'
                  }`}
                  onClick={() => {
                    tracker.track({
                      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_SIDEBAR_CLICKS,
                      type: MIXPANEL_EVENT_TYPE.INTEGRATIONS,
                    });
                    setActivePanel(null);
                    router.push('/integrations');
                  }}
                >
                  <Zap className="size-5" strokeWidth={1.5} />
                </Button>
              </CustomTooltipTrigger>
              <CustomTooltipContent collisionPadding={8}>Integrations</CustomTooltipContent>
            </CustomTooltip>

            {/* App download — web only */}
            <WebOnly>
              <CustomTooltip>
                <CustomTooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 cursor-pointer rounded-lg text-[#1A1A1A] hover:bg-[#F3F4F6]"
                    onClick={() => getPlatform().system?.openExternal('https://ekascribe.ai/download')}
                  >
                    <Download className="size-5" strokeWidth={1.5} />
                  </Button>
                </CustomTooltipTrigger>
                <CustomTooltipContent collisionPadding={8}>App download</CustomTooltipContent>
              </CustomTooltip>
            </WebOnly>

            {/* Help */}
            <CustomTooltip>
              <CustomTooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-9 cursor-pointer rounded-lg ${
                    activePanel === 'help'
                      ? 'bg-gradient-to-b from-[#EBF0FF] to-[#D6E0FF] text-[#3B5BDB] border border-[#B4C6FC]'
                      : 'text-[#1A1A1A] hover:bg-[#F3F4F6]'
                  }`}
                  onClick={() => {
                    setActivePanel(activePanel === 'help' ? null : 'help');
                  }}
                >
                  <CircleHelp className="size-5" strokeWidth={1.5} />
                </Button>
              </CustomTooltipTrigger>
              <CustomTooltipContent collisionPadding={8}>Help</CustomTooltipContent>
            </CustomTooltip>
          </div>
        </div>
      </SidebarFooter>
      <UserDefaultsDialog
        open={isUserDefaultsOpen}
        onOpenChange={(open) => {
          setIsUserDefaultsOpen(open);
          if (!open) {
            getStorage().session.remove('ekascribe:pending-modal');
          }
        }}
      />
      <WhatsAppSetupDialog open={whatsappSetupOpen} onOpenChange={setWhatsappSetupOpen} />
    </Sidebar>
  );
};

export default CustomSidebar;
