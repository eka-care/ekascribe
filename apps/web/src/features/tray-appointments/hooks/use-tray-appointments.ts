'use client';

import { useEffect, useMemo, useState } from 'react';
import { useEmrConfiguration } from '@/features/sidebar/hooks/use-emr-configuration';
import { useQueueAppointments } from '@/features/sidebar/hooks/use-queue-appointments';
import { usePatientBulkInfo } from '@/features/patient/hooks/use-patient-bulk-info';
import useVoice2RxStore from '@/store/store';

export type TrayAppointmentItem = {
  appointmentId: string;
  patientOid: string;
  patientName: string;
  age: number | null;
  gender: 'M' | 'F' | 'O' | null;
  mobile?: string;
  time: string;
  status: string;
  fullDate: string;
  section: 'Ongoing' | 'Booked';
};

const STATUS_LABELS: Record<string, string> = {
  BK: 'Booked',
  CK: 'Checked In',
  OG: 'Ongoing',
};

function buildItem(
  appt: { id: string; patient_oid: string; full_date: Date; status: string },
  patient: { fullName?: string; firstName?: string; age?: number; gender?: 'M' | 'F' | 'O'; mobile?: string } | undefined,
  section: 'Ongoing' | 'Booked',
): TrayAppointmentItem {
  const patientName = patient?.fullName || patient?.firstName || 'Unknown';
  const time = appt.full_date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return {
    appointmentId: appt.id,
    patientOid: appt.patient_oid,
    patientName,
    age: patient?.age ?? null,
    gender: patient?.gender ?? null,
    mobile: patient?.mobile,
    time,
    status: STATUS_LABELS[appt.status] ?? appt.status,
    fullDate: appt.full_date.toISOString(),
    section,
  };
}

export function useTrayAppointments(): TrayAppointmentItem[] {
  const { clinics, doctors, loading: emrLoading, getDoctorsForClinic } = useEmrConfiguration();
  const emrConnected = !emrLoading && clinics.length > 0;

  const selectedDoctorId = useVoice2RxStore((state) => state.selectedQueueDoctorId);
  const selectedClinicId = useVoice2RxStore((state) => state.selectedQueueClinicId);

  const isAllDoctorsSelected = selectedDoctorId === 'all';

  const scopedDoctorOids = useMemo(() => {
    if (!selectedClinicId || selectedClinicId === 'all') {
      return doctors.map((d) => d.id);
    }
    return getDoctorsForClinic(selectedClinicId).map((d) => d.id);
  }, [selectedClinicId, doctors, getDoctorsForClinic]);

  const { appointments, loading: apptLoading } = useQueueAppointments(
    isAllDoctorsSelected
      ? { doctorOids: scopedDoctorOids }
      : { doctorOidOverride: selectedDoctorId }
  );
  const { fetchPatients } = usePatientBulkInfo();

  const [enrichedAppointments, setEnrichedAppointments] = useState<TrayAppointmentItem[]>([]);

  useEffect(() => {
    if (emrLoading || !emrConnected || apptLoading) {
      if (!emrLoading && !emrConnected) {
        setEnrichedAppointments([]);
      }
      return;
    }

    const ongoing = appointments
      .filter((a) => a.status === 'OG' || a.status === 'CK')
      .sort((a, b) => a.full_date.getTime() - b.full_date.getTime())
      .slice(0, 3);

    const booked = appointments
      .filter((a) => a.status === 'BK')
      .sort((a, b) => a.full_date.getTime() - b.full_date.getTime())
      .slice(0, 3);

    const combined = [...ongoing, ...booked];

    if (combined.length === 0) {
      setEnrichedAppointments([]);
      return;
    }

    fetchPatients(combined.map((a) => a.patient_oid)).then((patients) => {
      const patientMap = new Map(patients.map((p) => [p.oid, p]));
      setEnrichedAppointments([
        ...ongoing.map((appt) => buildItem(appt, patientMap.get(appt.patient_oid), 'Ongoing')),
        ...booked.map((appt) => buildItem(appt, patientMap.get(appt.patient_oid), 'Booked')),
      ]);
    });
  }, [emrLoading, emrConnected, appointments, apptLoading, fetchPatients]);

  return enrichedAppointments;
}
