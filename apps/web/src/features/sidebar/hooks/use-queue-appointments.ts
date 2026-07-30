'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  Unsubscribe,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { getFirestoreDB } from '../../../lib/firebase';
import { useFirebaseAuth } from '@/shared-hooks/use-firebase-auth';
import useVoice2RxStore from '@/store/store';

export type TVisitType = 'FLW' | 'REG';

export type TQueueStatus = 'CK' | 'OG' | 'CM' | 'CMNP' | 'BK';

export type TQueueAppointment = {
  id: string;
  patient_oid: string;
  full_date: Date;
  status: TQueueStatus;
  doctor_oid: string;
  bid: string;
  created_at: Date;
  date: Date;
  last_action: string;
  visit_type: TVisitType;
  archive: boolean;
  encounter_id?: string;
};

type FirestoreAppointment = {
  patient_oid: string;
  full_date: Timestamp;
  status: TQueueStatus;
  doctor_oid: string;
  bid: string;
  created_at: Timestamp;
  date: Timestamp;
  last_action: string;
  visit_type: TVisitType;
  archive: boolean;
  partner_meta?: {
    encounter_id?: string;
  };
  aid: string;
};

interface UseQueueAppointmentsOptions {
  doctorOidOverride?: string | null;
  doctorOids?: string[] | null;
}

// Firestore allows at most 30 disjunctions per query. The status filter already
// uses an `in` of 5 values, so a second `in` on doctor_oid is capped at
// floor(30 / 5) = 6 ids per query. Larger doctor lists are split across multiple
// listeners and merged.
const DOCTOR_OID_CHUNK_SIZE = 6;

const chunkArray = <T>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

interface UseQueueAppointmentsReturn {
  appointments: TQueueAppointment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Get today's date range (start and end of day)
const getTodayRange = () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  return {
    start: Timestamp.fromDate(startOfDay),
    end: Timestamp.fromDate(endOfDay),
  };
};

const mapDoc = (doc: any): TQueueAppointment => {
  const data = doc.data() as FirestoreAppointment;
  return {
    id: doc.id,
    patient_oid: data.patient_oid,
    full_date: data.full_date?.toDate() || new Date(),
    status: data.status,
    doctor_oid: data.doctor_oid,
    bid: data.bid,
    created_at: data.created_at?.toDate() || new Date(),
    date: data.date?.toDate() || new Date(),
    last_action: data.last_action || '',
    visit_type: data.visit_type || 'REG',
    archive: data.archive || false,
    encounter_id: data.aid,
  };
};

export const useQueueAppointments = (
  options?: UseQueueAppointmentsOptions
): UseQueueAppointmentsReturn => {
  const [appointments, setAppointments] = useState<TQueueAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loggedInUserDetails = useVoice2RxStore((state) => state.loggedInUserDetails);

  const doctorOids = options?.doctorOids ?? null;
  const isAllDoctors = doctorOids !== null;

  const doctorOid = options?.doctorOidOverride || loggedInUserDetails?.oid;
  const businessID = loggedInUserDetails?.['b-id'];

  const {
    isAuthenticated: isFirebaseAuth,
    loading: authLoading,
    error: authError,
    forceReAuth,
  } = useFirebaseAuth();

  const hasAttemptedReAuth = useRef(false);
  const unsubscribesRef = useRef<Unsubscribe[]>([]);

  const subscribe = useCallback(() => {
    // Cleanup previous listeners
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];

    if (!isFirebaseAuth) {
      if (!authLoading) {
        setLoading(false);
        if (authError) {
          setError(`Firebase auth failed: ${authError}`);
        }
      }
      return;
    }

    // "All Doctors" → every id in the list; otherwise the single selected doctor.
    const targetDoctorOids = isAllDoctors
      ? (doctorOids ?? []).map(String)
      : doctorOid
      ? [String(doctorOid)]
      : [];

    if (!businessID || targetDoctorOids.length === 0) {
      setLoading(false);
      setAppointments([]);
      return;
    }

    hasAttemptedReAuth.current = false;
    setLoading(true);
    setError(null);

    const handleListenerError = async (err: unknown) => {
      console.error('Firestore listener error:', err);

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
        } catch (reAuthErr) {
          console.error('Re-authentication failed:', reAuthErr);
        }
        // Don't set error yet — let re-auth trigger a re-subscribe
        return;
      }

      setError(err instanceof Error ? err.message : 'Failed to listen to appointments');
      setLoading(false);
    };

    try {
      const db = getFirestoreDB();
      const appointmentsRef = collection(db, 'appointments');
      const { start, end } = getTodayRange();
      const businessIDStr = String(businessID);

      // Firestore caps a second `in` clause, so split doctors into chunks and
      // merge the per-chunk snapshots into a single sorted list.
      // [[d1…d7], [d8…d14], [d15…d18]]
      const oidChunks = chunkArray(targetDoctorOids, DOCTOR_OID_CHUNK_SIZE);
      // [ [],  [],  [] ]
      const chunkResults: TQueueAppointment[][] = oidChunks.map(() => []);
      const respondedChunks = new Set<number>();

      const mergeAndSet = () => {
        const merged = chunkResults
          .flat()
          .sort((a, b) => a.full_date.getTime() - b.full_date.getTime());
        setAppointments(merged);
      };

      oidChunks.forEach((chunkOids, index) => {
        const q = query(
          appointmentsRef,
          where('bid', '==', businessIDStr),
          where('archive', '==', false),
          where('full_date', '>=', start),
          where('full_date', '<=', end),
          where('status', 'in', ['BK', 'CK', 'OG', 'CM', 'CMNP']),
          where('doctor_oid', 'in', chunkOids),
          orderBy('full_date', 'asc')
        );

        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            chunkResults[index] = snapshot.docs.map(mapDoc);
            respondedChunks.add(index);
            mergeAndSet();
            if (respondedChunks.size === oidChunks.length) {
              setLoading(false);
            }
            setError(null);
          },
          handleListenerError
        );

        unsubscribesRef.current.push(unsubscribe);
      });
    } catch (err) {
      console.error('Error setting up listener:', err);
      setError(err instanceof Error ? err.message : 'Failed to setup appointments listener');
      setLoading(false);
    }
  }, [
    doctorOid,
    isAllDoctors,
    doctorOids,
    businessID,
    isFirebaseAuth,
    authLoading,
    authError,
    forceReAuth,
  ]);

  useEffect(() => {
    subscribe();
    return () => {
      unsubscribesRef.current.forEach((unsub) => unsub());
      unsubscribesRef.current = [];
    };
  }, [subscribe]);

  // Manual refetch: tear down and re-create listeners
  const refetch = useCallback(async () => {
    subscribe();
  }, [subscribe]);

  return {
    appointments,
    loading: loading || authLoading,
    error,
    refetch,
  };
};
