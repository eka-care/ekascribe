export type WhatsAppPrescriptionState =
  | 'AUTO_SEND'
  | 'PENDING'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'RETRY_EXHAUSTED';

export type SendFailureReason =
  | 'appointment_not_found'
  | 'not_completed'
  | 'no_prescription_url'
  | 'already_sent'
  | 'mobile_missing'
  | 'pdf_fetch_failed'
  | 'whatsapp_disconnected'
  | 'whatsapp_send_failed';

export type SendPrescriptionOptions = {
  phoneNumberOverride?: string;
  onMissingMobile?: (ctx: {
    appointmentId: string;
    patientOid: string;
    patientName?: string;
  }) => Promise<string | null>;
  caption?: string;
  doctorName?: string;
  fileName?: string;
};

export type SendPrescriptionResult =
  | { success: true; state: 'SENT'; patientName?: string }
  | { success: false; reason: SendFailureReason; message?: string };

export const COMPLETED_STATUS = 'CM' as const;

export type AppointmentDoc = {
  id: string;
  patient_oid: string;
  status: string;
  full_date?: string;
  prescription_url?: string;
  print_prescription_url?: string;
  prescription_whatsapp_status?: WhatsAppPrescriptionState;
};
