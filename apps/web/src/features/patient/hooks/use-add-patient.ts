import { TSelectedPatientDetails } from '@/constants/types';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import { useCallback } from 'react';
import { tracker } from '@/analytics';

export const useAddPatient = () => {
  // Patch patient details to a session
  const addPatientToSession = useCallback(
    async (sessionID: string, patientDetails: TSelectedPatientDetails) => {
      try {
        const response = await with401Retry(
          () =>
            getSDK().sessions.patchSessionStatus(
              {
                patient_details: {
                  oid: patientDetails.oid,
                  name: patientDetails.username,
                  age: patientDetails.age != null ? String(patientDetails.age) : undefined,
                  gender: patientDetails.biologicalSex,
                },
              },
              sessionID
            ),
          'patch patient details to session'
        );

        return response;
      } catch (err) {
        console.error('Error patching patient details to session:', err);
        tracker.error(err, { domain: 'api', component: 'trinity', extra: { action: 'patient_update', session_id: sessionID } });
        throw err;
      }
    },
    []
  );

  return { addPatientToSession };
};
