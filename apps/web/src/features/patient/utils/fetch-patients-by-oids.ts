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
};

const mapGender = (gen: string): Gender => {
  if (gen === 'F') return 'F';
  if (gen === 'O') return 'O';
  return 'M';
};

export async function fetchPatientsByOids(oids: string[]): Promise<TPatientInfo[]> {
  if (!oids.length) return [];
  const uniqueOids = [...new Set(oids)];
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
  return (response || []).map((patient: ApiPatientResponse) => ({
    oid: patient.oid,
    wid: patient.wid,
    gender: mapGender(patient.gen),
    dob: patient.dob,
    firstName: patient.fn,
    fullName: patient.fln,
    isAgeApproximate: patient.is_age,
    age: calculateAgeFromDOB(patient.dob),
    mobile: patient.mobile,
  }));
}
