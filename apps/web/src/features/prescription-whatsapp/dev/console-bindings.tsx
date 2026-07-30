'use client';

import { useEffect } from 'react';
import { sendPrescriptionViaWhatsApp } from '../utils/send-prescription';

type WindowWithBinding = Window & {
  __sendPrescription?: typeof sendPrescriptionViaWhatsApp;
};

export default function PrescriptionConsoleBindings() {
  useEffect(() => {
    (window as WindowWithBinding).__sendPrescription = sendPrescriptionViaWhatsApp;
    return () => {
      delete (window as WindowWithBinding).__sendPrescription;
    };
  }, []);

  return null;
}
