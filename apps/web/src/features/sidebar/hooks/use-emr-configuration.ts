'use client';

import { useState, useEffect, useCallback } from 'react';
import fetchWrapper from '@/fetch-client';
import { GET_HUB_HOST } from '@/fetch-client/helper';
import useVoice2RxStore from '@/store/store';

export type TEmrClinic = {
  id: string;
  name: string;
  doctorIds: string[];
};

export type TEmrDoctor = {
  id: string;
  name: string;
};

type ApiClinic = {
  id: string;
  name: string;
  doctors: string[];
};

type ApiDoctor = {
  id: string;
  personal: {
    name: {
      f: string;
      l?: string;
    };
  };
};

type ApiConfigResponse = {
  clinics: ApiClinic[];
  doctors: ApiDoctor[];
};

interface UseEmrConfigurationReturn {
  clinics: TEmrClinic[];
  doctors: TEmrDoctor[];
  loading: boolean;
  getDoctorsForClinic: (clinicId: string) => TEmrDoctor[];
}

const CONFIG_KEYS = 'id,business_name,clinics,doctors';

const mapDoctorName = (doctor: ApiDoctor): string => {
  const { f, l } = doctor.personal.name;
  return [f, l].filter(Boolean).join(' ').trim();
};

export const useEmrConfiguration = (): UseEmrConfigurationReturn => {
  const [clinics, setClinics] = useState<TEmrClinic[]>([]);
  const [allDoctors, setAllDoctors] = useState<TEmrDoctor[]>([]);
  const [loading, setLoading] = useState(true);

  const businessID = useVoice2RxStore((state) => state.loggedInUserDetails?.['b-id']);

  const fetchConfig = useCallback(async () => {
    if (!businessID) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const url = `${GET_HUB_HOST()}/onboarding/5/configuration/?config_keys=${CONFIG_KEYS}&format=json`;
      const res = await fetchWrapper(url, { method: 'GET' });

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data: ApiConfigResponse = await res.json();

      const doctorMap = new Map<string, TEmrDoctor>();
      (data.doctors || []).forEach((d) => {
        doctorMap.set(d.id, { id: d.id, name: mapDoctorName(d) });
      });

      const mappedClinics: TEmrClinic[] = (data.clinics || []).map((c) => ({
        id: c.id,
        name: c.name,
        doctorIds: c.doctors || [],
      }));

      setClinics(mappedClinics);
      setAllDoctors(Array.from(doctorMap.values()));
    } catch {
    } finally {
      setLoading(false);
    }
  }, [businessID]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const getDoctorsForClinic = useCallback(
    (clinicId: string): TEmrDoctor[] => {
      const clinic = clinics.find((c) => c.id === clinicId);
      if (!clinic) return [];
      return clinic.doctorIds
        .map((id) => allDoctors.find((d) => d.id === id))
        .filter((d): d is TEmrDoctor => !!d);
    },
    [clinics, allDoctors]
  );

  return { clinics, doctors: allDoctors, loading, getDoctorsForClinic };
};
