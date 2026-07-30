'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { getTrinitySDKInstance } from '@eka-care/patient-ts-sdk';
import useVoice2RxStore from '@/store/store';
import { globalTrinitySDKConfig } from '@/constants/constant';
import { TSearchPatient } from '@/constants/types';
import { calculateAgeFromDOB } from '@/utils/calculate-age';
import { tracker } from '@/analytics';

export interface Patient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface UsePatientSearchReturn {
  searchPatients: (prefix: string) => void;
  isLoading: boolean;
  error: string | null;
}

export const usePatientSearch = (): UsePatientSearchReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { setSearchedPatientsList, workspaceID } = useVoice2RxStore();

  // Actual search function that performs the API call
  const performSearch = useCallback(
    async (prefix: string) => {
      if (!prefix.trim()) {
        setSearchedPatientsList([]);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const trinitySDK = getTrinitySDKInstance({
          ...globalTrinitySDKConfig,
          workspaceId: workspaceID,
        });

        const response = await trinitySDK.searchPatientByPrefix?.(prefix, 20, undefined, true);

        if (response && Array.isArray(response)) {
          // Map the response to Patient interface
          const patients: TSearchPatient[] = response.map((patient) => {
            return {
              oid: patient.oid,
              c_ate: patient.c_ate,
              u_ate: patient.u_ate,
              dob: patient.dob,
              username:
                patient.fln || patient.username || `${patient.fn} ${patient.mn} ${patient.ln}`,
              email: patient.email,
              mobile: patient.mobile,
              gen: patient.gen,
              age: patient.dob ? calculateAgeFromDOB(patient.dob) : 0,
            };
          });

          setSearchedPatientsList(patients);
        } else {
          setSearchedPatientsList([]);
        }
      } catch (err) {
        console.error('Error searching patients:', err);
        tracker.error(err, { domain: 'api', component: 'trinity', extra: { action: 'patient_search' } });
        setError(err instanceof Error ? err.message : 'Failed to search patients');

        setSearchedPatientsList([]);
      } finally {
        setIsLoading(false);
      }
    },
    [setSearchedPatientsList]
  );

  // Debounced search function with 3 character minimum and 300ms delay
  const searchPatients = useCallback(
    (prefix: string) => {
      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // If prefix is empty, clear results immediately
      if (!prefix.trim()) {
        setSearchedPatientsList([]);
        return;
      }

      // Check for minimum 2 characters
      if (prefix.trim().length < 2) {
        setSearchedPatientsList([]);
        return;
      }

      // Set new timeout for 300ms debounce
      debounceTimeoutRef.current = setTimeout(() => {
        performSearch(prefix);
      }, 300);
    },
    [performSearch, setSearchedPatientsList]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    searchPatients,
    isLoading,
    error,
  };
};
