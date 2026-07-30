'use client';

import { useState, useCallback, useRef } from 'react';
import fetchWrapper from '@/fetch-client';
import { Gender } from '@/constants/types';
import { calculateAgeFromDOB } from '@/utils/calculate-age';
import { GET_AORTAGO_HOST } from '@/fetch-client/helper';

const PATIENT_BULK_API = `${GET_AORTAGO_HOST()}/profiles/v1/patient/bulk`;

export type TPatientInfo = {
  oid: string;
  wid: string;
  gender: Gender;
  dob: string;
  firstName: string;
  fullName: string;
  isAgeApproximate: boolean;
  age: number;
  mobile?: string;
  username?: string;
};

type ApiPatientResponse = {
  oid: string;
  wid: string;
  gen: string;
  dob: string;
  fn: string;
  fln: string;
  is_age: boolean;
  mobile?: string;
  username?: string;
};

interface UsePatientBulkInfoReturn {
  patientCache: Map<string, TPatientInfo>;
  loading: boolean;
  error: string | null;
  fetchPatients: (oids: string[]) => Promise<TPatientInfo[]>;
}

// Map gender from API response
const mapGender = (gen: string): Gender => {
  if (gen === 'F') return 'F';
  if (gen === 'O') return 'O';
  return 'M';
};

export const usePatientBulkInfo = (): UsePatientBulkInfoReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patientCacheRef = useRef<Map<string, TPatientInfo>>(new Map());

  const fetchPatients = useCallback(async (oids: string[]): Promise<TPatientInfo[]> => {
    if (!oids.length) return [];

    setError(null);

    // Filter out already cached oids
    const uncachedOids = oids.filter((oid) => !patientCacheRef.current.has(oid));

    // If all oids are cached, return from cache
    if (uncachedOids.length === 0) {
      return oids.map((oid) => patientCacheRef.current.get(oid)!).filter(Boolean);
    }

    setLoading(true);

    try {
      const uniqueOids = [...new Set(uncachedOids)];
      const oidList = uniqueOids.join(',');
      const url = `${PATIENT_BULK_API}?oid_list=${encodeURIComponent(oidList)}&flatten=true`;

      const res = await fetchWrapper(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch patient info');
      }

      const response = await res.json();

      const patients: TPatientInfo[] = (response || []).map((patient: ApiPatientResponse) => ({
        oid: patient.oid,
        wid: patient.wid,
        gender: mapGender(patient.gen),
        dob: patient.dob,
        firstName: patient.fn,
        fullName: patient.fln,
        isAgeApproximate: patient.is_age,
        age: calculateAgeFromDOB(patient.dob),
        mobile: patient.mobile,
        username: patient.username,
      }));

      // Add to cache
      patients.forEach((patient) => {
        patientCacheRef.current.set(patient.oid, patient);
      });

      // Return all requested patients (cached + newly fetched)
      return oids.map((oid) => patientCacheRef.current.get(oid)!).filter(Boolean);
    } catch (err) {
      console.error('Error fetching patient info:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch patient info');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    patientCache: patientCacheRef.current,
    loading,
    error,
    fetchPatients,
  };
};
