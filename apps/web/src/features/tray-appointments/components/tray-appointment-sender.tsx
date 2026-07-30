'use client';

import { useEffect } from 'react';
import { useHostBridge } from '@/platform';
import { useTrayAppointments } from '../hooks/use-tray-appointments';

export default function TrayAppointmentSender() {
  const appointments = useTrayAppointments();
  const hostBridge = useHostBridge();

  useEffect(() => {
    hostBridge?.sendAppointments(appointments);
  }, [appointments, hostBridge]);

  return null;
}
