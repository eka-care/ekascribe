import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getFirestoreDB } from '../../../lib/firebase';
import type { AppointmentDoc, WhatsAppPrescriptionState } from '../types';

const APPOINTMENTS_COLLECTION = 'appointments';

type TimestampLike = { toDate: () => Date };

export async function getAppointmentDoc(appointmentId: string): Promise<AppointmentDoc | null> {
  const db = getFirestoreDB();
  const ref = doc(db, APPOINTMENTS_COLLECTION, appointmentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as Partial<Omit<AppointmentDoc, 'id'>> & { full_date?: TimestampLike };
  const fullDate = typeof data.full_date?.toDate === 'function' ? data.full_date.toDate().toISOString() : undefined;
  return {
    id: snap.id,
    patient_oid: data.patient_oid ?? '',
    status: data.status ?? '',
    full_date: fullDate,
    prescription_url: data.prescription_url,
    print_prescription_url: data.print_prescription_url,
    prescription_whatsapp_status: data.prescription_whatsapp_status,
  };
}

export async function updateAppointmentSendState(
  appointmentId: string,
  state: WhatsAppPrescriptionState,
): Promise<void> {
  const db = getFirestoreDB();
  const ref = doc(db, APPOINTMENTS_COLLECTION, appointmentId);
  await updateDoc(ref, { prescription_whatsapp_status: state });
}
