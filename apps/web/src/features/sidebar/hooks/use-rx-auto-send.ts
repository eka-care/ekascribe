'use client';

import { useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { getFirestoreDB } from '../../../lib/firebase';
import { useFirebaseAuth } from '@/shared-hooks/use-firebase-auth';
import useVoice2RxStore from '@/store/store';
import { useWhatsApp, useDesktopSettings, getPlatform } from '@/platform';
import type { WhatsAppPrescriptionState } from '@/features/prescription-whatsapp/types';
import { sendPrescriptionViaWhatsApp } from '@/features/prescription-whatsapp/utils/send-prescription';
import { updateAppointmentSendState } from '@/features/prescription-whatsapp/utils/appointment-firestore';

type FirestoreAppointment = {
  patient_oid: string;
  full_date: Timestamp;
  status: string;
  bid: string;
  created_at: Timestamp;
  date: Timestamp;
  visit_type: string;
  archive: boolean;
  prescription_url?: string;
  print_prescription_url?: string;
  prescription_whatsapp_status?: WhatsAppPrescriptionState;
  aid: string;
};

type WhatsAppAutoSendPreferences = {
  send_via_linked_device: boolean;
  auto_send_rate_limit: number;
  allow_partner_emr_auto_send: boolean;
};

const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const getTodayRange = () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return {
    start: Timestamp.fromDate(startOfDay),
    end: Timestamp.fromDate(endOfDay),
  };
};

export const useRxAutoSend = () => {
  const loggedInUserDetails = useVoice2RxStore((state) => state.loggedInUserDetails);
  const userOid = loggedInUserDetails?.oid;
  const businessID = loggedInUserDetails?.['b-id'];

  const { isAuthenticated: isFirebaseAuth, loading: authLoading, error: authError, forceReAuth } = useFirebaseAuth();

  const whatsapp = useWhatsApp();
  const desktopSettings = useDesktopSettings();

  const whatsappConnected = useRef(false);
  const hasAttemptedReAuth = useRef(false);
  const inFlight = useRef<Set<string>>(new Set());
  const sendTimestamps = useRef<number[]>([]);
  const whatsAppPrefsRef = useRef<WhatsAppAutoSendPreferences>({
    send_via_linked_device: false,
    auto_send_rate_limit: 1,
    allow_partner_emr_auto_send: false,
  });
  const doctorNameRef = useRef<string | undefined>(undefined);
  doctorNameRef.current = loggedInUserDetails
    ? [loggedInUserDetails.s, loggedInUserDetails.fn, loggedInUserDetails.mn, loggedInUserDetails.ln]
        .filter(Boolean)
        .join(' ') || undefined
    : undefined;

  useEffect(() => {
    if (!desktopSettings) return;
    desktopSettings.getWhatsAppAutoSendPrefs().then((prefs) => {
      if (prefs) whatsAppPrefsRef.current = prefs;
    }).catch(() => {});
  }, [desktopSettings]);

  useEffect(() => {
    if (!desktopSettings) return;
    const unsub = desktopSettings.onWhatsAppPrefsUpdated((prefs) => {
      whatsAppPrefsRef.current = prefs;
    });
    return () => unsub?.();
  }, [desktopSettings]);

  const handleAutoSend = useCallback((appointmentId: string) => {
    const settings = whatsAppPrefsRef.current;

    if (!settings.allow_partner_emr_auto_send) return;

    if (inFlight.current.has(appointmentId)) return;

    const now = Date.now();
    const recent = sendTimestamps.current.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= settings.auto_send_rate_limit) {
      updateAppointmentSendState(appointmentId, 'PENDING').catch(() => {});
      return;
    }

    sendTimestamps.current = [...recent, now];
    inFlight.current.add(appointmentId);

    sendPrescriptionViaWhatsApp(appointmentId, { doctorName: doctorNameRef.current })
      .then((result) => {
        if (result.success) {
          const name = result.patientName || 'patient';
          getPlatform().notifier?.show('Prescription Sent', {
            body: `Prescription sent to ${name}`,
          });
        }
      })
      .finally(() => {
        inFlight.current.delete(appointmentId);
      });
  }, []);

  const setupListener = useCallback(
    (isRetry = false): (() => void) | undefined => {
      if (!whatsapp || !whatsappConnected.current) return undefined;
      if (!isFirebaseAuth) return undefined;
      if (!userOid || !businessID) return undefined;

      if (!isRetry) hasAttemptedReAuth.current = false;

      const db = getFirestoreDB();
      const appointmentsRef = collection(db, 'appointments');
      const { start, end } = getTodayRange();

      const q = query(
        appointmentsRef,
        where('bid', '==', String(businessID)),
        where('archive', '==', false),
        where('full_date', '>=', start),
        where('full_date', '<=', end),
        where('status', '==', 'CM'),
        where('rx_created_by', '==', String(userOid)),
        orderBy('full_date', 'asc'),
      );

      let isFirstSnapshot = true;

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          if (isFirstSnapshot) {
            isFirstSnapshot = false;
            return;
          }

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') return;
            const data = change.doc.data() as FirestoreAppointment;

            if (change.type === 'added' || data.prescription_whatsapp_status === 'AUTO_SEND') {
              handleAutoSend(change.doc.id);
            }
          });
        },
        async (err) => {
          console.error('[RxAutoSend] listener error:', err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          const isAuthError =
            errorMessage.includes('permission-denied') ||
            errorMessage.includes('unauthenticated') ||
            errorMessage.includes('PERMISSION_DENIED') ||
            errorMessage.includes('Missing or insufficient permissions');

          if (isAuthError && !hasAttemptedReAuth.current) {
            hasAttemptedReAuth.current = true;
            try {
              await forceReAuth();
              setupListener(true);
            } catch {
              console.error('[RxAutoSend] re-authentication failed');
            }
          }
        },
      );

      return unsub;
    },
    [userOid, businessID, isFirebaseAuth, authLoading, authError, forceReAuth, handleAutoSend, whatsapp],
  );

  useEffect(() => {
    if (!whatsapp) return;

    let unsubListener: (() => void) | undefined;

    const startListener = () => {
      unsubListener?.();
      unsubListener = setupListener();
    };

    const stopListener = () => {
      unsubListener?.();
      unsubListener = undefined;
    };

    whatsapp.getStatus().then(({ status }) => {
      whatsappConnected.current = status === 'connected';
      if (whatsappConnected.current) startListener();
    }).catch(() => {});

    const unsubStatus = whatsapp.onStatusChange((status) => {
      const nowConnected = status === 'connected';
      whatsappConnected.current = nowConnected;
      if (nowConnected) startListener();
      else stopListener();
    });

    return () => {
      stopListener();
      unsubStatus();
    };
  }, [setupListener, whatsapp]);
};
