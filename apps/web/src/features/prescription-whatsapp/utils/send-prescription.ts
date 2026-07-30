import { fetchPatientsByOids } from '@/features/patient/utils/fetch-patients-by-oids';
import { buildCaption } from '@/features/session/components/dialogs/whatsapp-send-dialog';
import { getPlatform } from '@/platform';
import {
  COMPLETED_STATUS,
  type SendFailureReason,
  type SendPrescriptionOptions,
  type SendPrescriptionResult,
  type WhatsAppPrescriptionState,
} from '../types';
import { getAppointmentDoc, updateAppointmentSendState } from './appointment-firestore';
import { fetchPdfBuffer } from './fetch-prescription-pdf';

const RETRYABLE_INITIAL_STATES: ReadonlyArray<WhatsAppPrescriptionState | undefined> = [
  undefined,
  'AUTO_SEND',
  'PENDING',
  'FAILED',
];

function fail(reason: SendFailureReason, message?: string): SendPrescriptionResult {
  return { success: false, reason, message };
}

export async function sendPrescriptionViaWhatsApp(
  appointmentId: string,
  options: SendPrescriptionOptions = {},
): Promise<SendPrescriptionResult> {
  const appt = await getAppointmentDoc(appointmentId);
  if (!appt) return fail('appointment_not_found');

  if (appt.status !== COMPLETED_STATUS) return fail('not_completed', `status=${appt.status}`);

  const pdfUrl = appt.prescription_url || appt.print_prescription_url;
  if (!pdfUrl) return fail('no_prescription_url');

  if (!RETRYABLE_INITIAL_STATES.includes(appt.prescription_whatsapp_status)) {
    return fail('already_sent', `state=${appt.prescription_whatsapp_status}`);
  }

  await updateAppointmentSendState(appointmentId, 'SENDING');

  let phoneNumber = options.phoneNumberOverride;
  let patientName: string | undefined;

  if (!phoneNumber) {
    const patients = await fetchPatientsByOids([appt.patient_oid]);
    const patient = patients[0];
    patientName = patient?.fullName;
    phoneNumber = patient?.mobile;
  }

  if (!phoneNumber && options.onMissingMobile) {
    const provided = await options.onMissingMobile({
      appointmentId,
      patientOid: appt.patient_oid,
      patientName,
    });
    phoneNumber = provided ?? undefined;
  }

  if (!phoneNumber) {
    await updateAppointmentSendState(appointmentId, 'PENDING');
    return fail('mobile_missing');
  }

  let pdfBuffer: ArrayBuffer;
  try {
    pdfBuffer = await fetchPdfBuffer(pdfUrl);
  } catch (err) {
    await updateAppointmentSendState(appointmentId, 'FAILED');
    return fail('pdf_fetch_failed', err instanceof Error ? err.message : String(err));
  }

  const whatsapp = getPlatform().whatsapp;
  if (!whatsapp) {
    await updateAppointmentSendState(appointmentId, 'FAILED');
    return fail('whatsapp_disconnected', 'whatsapp capability unavailable');
  }

  const status = await whatsapp.getStatus();
  if (status.status !== 'connected') {
    await updateAppointmentSendState(appointmentId, 'FAILED');
    return fail('whatsapp_disconnected', `status=${status.status}`);
  }

  const fileName = options.fileName ?? `prescription-${appointmentId}.pdf`;
  const caption =
    options.caption ??
    buildCaption({ patientName, doctorName: options.doctorName, sessionCreatedAt: appt.full_date });
  const result = await whatsapp.sendDocument({
    phoneNumber,
    pdfBuffer,
    fileName,
    caption,
  });

  if (!result.success) {
    await updateAppointmentSendState(appointmentId, 'FAILED');
    return fail('whatsapp_send_failed', result.error);
  }

  await updateAppointmentSendState(appointmentId, 'SENT');
  return { success: true, state: 'SENT', patientName: patientName ?? undefined };
}
