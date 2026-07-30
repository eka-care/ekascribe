'use client';

import { useState, useCallback, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { ChevronDown, CircleUserRound, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@ui/src';
import useVoice2RxStore from '@/store/store';
import AddNewPatientForm, {
  AddNewPatientFormHandle,
} from '@/features/patient/components/add-new-patient-form';
import { usePatientSearch } from '@/features/patient/hooks/use-patient-search';
import { TSearchPatient, TSelectedPatientDetails } from '@/constants/types';
import { getTrinitySDKInstance } from '@eka-care/patient-ts-sdk';
import { globalTrinitySDKConfig } from '@/constants/constant';
import { calculateDOBFromAge } from '@/utils/calculate-age';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import { tracker } from '@/analytics';
import { useAddPatient } from '@/features/patient/hooks/use-add-patient';
import { PatientSuggestions } from './patient-suggestions';

export interface PatientDirectoryHandle {
  saveNewPatientIfPending: () => Promise<void>;
  isAddFormOpen: () => boolean;
}

type FormMode = 'add' | 'edit' | null;

interface PatientDirectoryComponentProps {
  sessionId: string;
  disabled?: boolean;
  onDisabledClick?: () => void;
}

const getGenderLabel = (gen?: string) => {
  if (!gen) return '';
  if (gen === 'M') return 'M';
  if (gen === 'F') return 'F';
  return 'O';
};

export const PatientDirectoryComponent = forwardRef<
  PatientDirectoryHandle,
  PatientDirectoryComponentProps
>(function PatientDirectoryComponent({ sessionId, disabled, onDisabledClick }, ref) {
  const patientDetails = useVoice2RxStore(
    (state) => state.sessionV2ContentById[sessionId]?.patient_details ?? null
  );
  const setSessionV2Content = useVoice2RxStore((state) => state.setSessionV2Content);
  const workspaceID = useVoice2RxStore((state) => state.workspaceID);
  const hasSelectedPatient = !!patientDetails?.username;

  const [isOpen, setIsOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [searchValue, setSearchValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const addFormRef = useRef<AddNewPatientFormHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { searchPatients: performSearch, isLoading: isSearchingPatients } = usePatientSearch();
  const { addPatientToSession } = useAddPatient();

  const patientAgeGenderText = hasSelectedPatient
    ? [
        patientDetails?.age ? `${patientDetails.age} yrs` : null,
        getGenderLabel(patientDetails?.biologicalSex),
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  // Focus search input only when entering the search state
  useEffect(() => {
    if (isOpen && !hasSelectedPatient && !formMode) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, hasSelectedPatient, formMode]);

  const closePopover = useCallback(() => {
    setIsOpen(false);
    setFormMode(null);
    setSearchValue('');
  }, []);

  const handleSaveNewPatient = useCallback(
    async (patient: TSelectedPatientDetails) => {
      try {
        tracker.track({
          name: MIXPANEL_EVENT_NAME.SCRIBEWEB_HOME_CLICKS,
          type: MIXPANEL_EVENT_TYPE.ADD_NEW_PATIENT,
        });
        tracker.log({
          name: 'patient_added',
          properties: { session_id: sessionId },
        });

        setIsSaving(true);

        const trinitySDK = getTrinitySDKInstance({
          ...globalTrinitySDKConfig,
          workspaceId: workspaceID,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createPatientResponse: any = await trinitySDK.createPatient({
          fln: patient.username,
          is_age: true,
          dob: calculateDOBFromAge(patient.age),
          gen: patient.biologicalSex,
          ...(patient.mobile ? { mobile: patient.mobile } : {}),
        });

        console.log('Create patient response:', createPatientResponse);

        if (createPatientResponse?.code >= 400 || createPatientResponse?.status_code >= 400) {
          useVoice2RxStore.getState().setWarningInfo({
            message: createPatientResponse?.error?.message || 'Failed to add patient.',
            type: 'error',
            screen: 'start_session',
          });
          return;
        }

        const newPatientDetails: TSelectedPatientDetails = {
          oid: createPatientResponse?.oid,
          username: patient.username,
          age: patient.age,
          biologicalSex: patient.biologicalSex,
          mobile: patient.mobile,
        };

        const patchResponse = await addPatientToSession(sessionId, newPatientDetails);

        console.log('Add patient to session response:', patchResponse);
        if (!patchResponse || !patchResponse.success) {
          useVoice2RxStore.getState().setWarningInfo({
            message:
              (!patchResponse?.success && patchResponse?.error?.message) ||
              'Failed to link patient to session.',
            type: 'error',
            screen: 'start_session',
          });
          return;
        }

        setSessionV2Content(sessionId, { patient_details: newPatientDetails });

        closePopover();
      } catch (err) {
        tracker.error(err, {
          domain: 'patient',
          component: 'add_patient',
          extra: { session_id: sessionId },
        });
        useVoice2RxStore.getState().setWarningInfo({
          message: 'Failed to add patient.',
          type: 'error',
          screen: 'start_session',
        });
      } finally {
        setIsSaving(false);
      }
    },
    [setSessionV2Content, workspaceID, sessionId, addPatientToSession, closePopover]
  );

  const handleSaveEditedPatient = useCallback(
    async (patient: TSelectedPatientDetails) => {
      if (!patientDetails?.oid) {
        useVoice2RxStore.getState().setWarningInfo({
          message: 'Cannot edit a patient without an ID.',
          type: 'error',
          screen: 'start_session',
        });
        return;
      }
      try {
        setIsSaving(true);

        const trinitySDK = getTrinitySDKInstance({
          ...globalTrinitySDKConfig,
          workspaceId: workspaceID,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateResponse: any = await trinitySDK.updatePatient({
          id: patientDetails.oid,
          data: {
            fln: patient.username,
            is_age: true,
            dob: calculateDOBFromAge(patient.age),
            gen: patient.biologicalSex,
            ...(patient.mobile ? { mobile: patient.mobile } : {}),
          },
        });

        if (updateResponse?.code >= 400 || updateResponse?.status_code >= 400) {
          useVoice2RxStore.getState().setWarningInfo({
            message: updateResponse?.error?.message || 'Failed to update patient.',
            type: 'error',
            screen: 'start_session',
          });
          return;
        }

        const updated: TSelectedPatientDetails = {
          oid: patientDetails.oid,
          username: patient.username,
          age: patient.age,
          biologicalSex: patient.biologicalSex,
          mobile: patient.mobile,
        };

        const patchResponse = await addPatientToSession(sessionId, updated);
        if (!patchResponse || !patchResponse.success) {
          useVoice2RxStore.getState().setWarningInfo({
            message:
              (!patchResponse?.success && patchResponse?.error?.message) ||
              'Failed to sync patient with session.',
            type: 'error',
            screen: 'start_session',
          });
          return;
        }

        setSessionV2Content(sessionId, { patient_details: updated });

        closePopover();
      } catch (err) {
        tracker.error(err, {
          domain: 'patient',
          component: 'edit_patient',
          extra: { session_id: sessionId },
        });
        useVoice2RxStore.getState().setWarningInfo({
          message: 'Failed to update patient.',
          type: 'error',
          screen: 'start_session',
        });
      } finally {
        setIsSaving(false);
      }
    },
    [patientDetails, workspaceID, sessionId, addPatientToSession, setSessionV2Content, closePopover]
  );

  const handleRemovePatient = useCallback(async () => {
    try {
      tracker.log({
        name: 'patient_removed',
        properties: { session_id: sessionId, patient_oid: patientDetails?.oid },
      });
      const response = await addPatientToSession(sessionId, {} as TSelectedPatientDetails);
      if (!response || !response.success) {
        useVoice2RxStore.getState().setWarningInfo({
          message: (!response?.success && response?.error?.message) || 'Failed to remove patient.',
          type: 'error',
          screen: 'start_session',
        });
        return;
      }
      setSessionV2Content(sessionId, { patient_details: null });
      closePopover();
    } catch (err) {
      tracker.error(err, {
        domain: 'patient',
        component: 'remove_patient',
        extra: { session_id: sessionId },
      });
      useVoice2RxStore.getState().setWarningInfo({
        message: 'Failed to remove patient.',
        type: 'error',
        screen: 'start_session',
      });
    }
  }, [sessionId, patientDetails, addPatientToSession, setSessionV2Content, closePopover]);

  useImperativeHandle(ref, () => ({
    isAddFormOpen: () => formMode === 'add',
    saveNewPatientIfPending: async () => {
      if (formMode !== 'add' || !addFormRef.current) return;
      const data = addFormRef.current.getPatientData();
      if (data) {
        await handleSaveNewPatient(data);
      }
    },
  }));

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      performSearch(value);
    },
    [performSearch]
  );

  const handlePatientSelect = useCallback(
    async (patient: TSearchPatient) => {
      try {
        tracker.track({
          name: MIXPANEL_EVENT_NAME.SCRIBEWEB_HOME_CLICKS,
          type: MIXPANEL_EVENT_TYPE.ADD_NEW_PATIENT,
        });
        tracker.log({
          name: 'patient_selected',
          properties: { session_id: sessionId, patient_oid: patient.oid },
        });

        const selectedPatient = {
          oid: patient.oid,
          username: patient.username,
          age: patient.age,
          biologicalSex: patient.gen,
        };

        const patchResponse = await addPatientToSession(sessionId, selectedPatient);
        if (!patchResponse || !patchResponse.success) {
          useVoice2RxStore.getState().setWarningInfo({
            message:
              (!patchResponse?.success && patchResponse?.error?.message) ||
              'Failed to link patient to session.',
            type: 'error',
            screen: 'start_session',
          });
          return;
        }

        setSessionV2Content(sessionId, { patient_details: selectedPatient });

        closePopover();
      } catch (err) {
        tracker.error(err, {
          domain: 'patient',
          component: 'select_patient',
          extra: { session_id: sessionId },
        });
        useVoice2RxStore.getState().setWarningInfo({
          message: 'Failed to link patient to session.',
          type: 'error',
          screen: 'start_session',
        });
      }
    },
    [setSessionV2Content, sessionId, addPatientToSession, closePopover]
  );

  const handleAddNewPatient = useCallback(() => {
    setFormMode('add');
  }, []);

  const handleCancelForm = useCallback(() => {
    closePopover();
  }, [closePopover]);

  const isFormOpen = formMode !== null;
  const showMenu = hasSelectedPatient && !isFormOpen;
  const showSearch = !hasSelectedPatient && !isFormOpen;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (disabled && open) {
          onDisabledClick?.();
          return;
        }
        setIsOpen(open);
        if (!open) {
          setFormMode(null);
          setSearchValue('');
        }
      }}
    >
      <PopoverTrigger asChild>
        {hasSelectedPatient ? (
          <button
            aria-disabled={disabled}
            onClick={(e) => {
              if (disabled) {
                e.preventDefault();
                onDisabledClick?.();
              }
            }}
            className={`flex items-center justify-between gap-2 py-1 px-2 w-full sm:w-fit rounded-lg transition-colors ${
              disabled
                ? 'opacity-80 cursor-not-allowed border border-transparent'
                : isOpen
                ? 'cursor-pointer bg-[#E9EFFF] border border-[#215FFF]'
                : 'cursor-pointer border border-transparent hover:bg-[#F5F8FF]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CircleUserRound className="w-5 h-5 text-[#215FFF] shrink-0" />
              <span className="text-lg font-medium text-[#1A1A1A] truncate">
                {patientDetails?.username}
              </span>
              {patientAgeGenderText && (
                <span className="text-sm text-[#767676] shrink-0">{patientAgeGenderText}</span>
              )}
            </div>
            <ChevronDown
              className={`w-3 h-3 text-[#767676] shrink-0 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        ) : (
          <button
            aria-disabled={disabled}
            onClick={(e) => {
              if (disabled) {
                e.preventDefault();
                onDisabledClick?.();
              }
            }}
            className={`w-full sm:w-fit flex items-center justify-between gap-2 py-1 px-2 rounded-lg transition-colors bg-white border border-[#D1D1D1] ${
              disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-[#F5F8FF]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-[#215FFF]" />
              <span className="text-lg font-medium text-[#1A1A1A]">Search or add patient name</span>
            </div>
            <ChevronDown
              className={`w-3 h-3 text-[#1A1A1A] transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className={
          isFormOpen
            ? 'w-[328px] p-0 border border-[#D1D1D1] rounded-lg bg-white shadow-md'
            : showMenu
            ? 'p-1 border border-[#D1D1D1] rounded-md shadow-md bg-white'
            : 'w-[328px] p-0 border border-[#D1D1D1] rounded-lg bg-white shadow-lg'
        }
      >
        {isFormOpen ? (
          <AddNewPatientForm
            ref={addFormRef}
            searchValue={searchValue}
            initialPatient={formMode === 'edit' ? patientDetails : null}
            onCancel={handleCancelForm}
            onSave={formMode === 'edit' ? handleSaveEditedPatient : handleSaveNewPatient}
            isSaving={isSaving}
          />
        ) : showMenu ? (
          <>
            <button
              onClick={() => setFormMode('edit')}
              className="w-full text-left px-2 py-1.5 text-sm text-[#1A1A1A] hover:bg-[#F5F5F5] rounded transition-colors cursor-pointer"
            >
              Edit details
            </button>
            <button
              onClick={handleRemovePatient}
              className="w-full text-left px-2 py-1.5 text-sm text-[#D92D20] hover:bg-[#F5F5F5] rounded transition-colors cursor-pointer"
            >
              Remove patient details
            </button>
          </>
        ) : (
          showSearch && (
            <PatientSuggestions
              searchValue={searchValue}
              searchInputRef={searchInputRef}
              isSearching={isSearchingPatients}
              onSearchChange={handleSearchChange}
              onSelect={handlePatientSelect}
              onAddNewPatient={handleAddNewPatient}
            />
          )
        )}
      </PopoverContent>
    </Popover>
  );
});
