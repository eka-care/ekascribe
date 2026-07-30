import { Gender, TSelectedPatientDetails } from '@/constants/types';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@ui/src';
import { AsYouType } from 'libphonenumber-js';
import PhoneInputField from '@/shared-components/input/phone-input';

function mobileIfEntered(value: string): string | undefined {
  if (!value) return undefined;
  const parser = new AsYouType();
  parser.input(value);
  return parser.getNumber()?.nationalNumber ? value : undefined;
}

export interface AddNewPatientFormHandle {
  getPatientData: () => TSelectedPatientDetails | null;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'M', label: 'M' },
  { value: 'F', label: 'F' },
  { value: 'O', label: 'O' },
];

const AddNewPatientForm = forwardRef<
  AddNewPatientFormHandle,
  {
    searchValue: string;
    onCancel?: () => void;
    onSave?: (data: TSelectedPatientDetails) => void;
    isSaving?: boolean;
    initialPatient?: TSelectedPatientDetails | null;
  }
>(function AddNewPatientForm({ searchValue, onCancel, onSave, isSaving, initialPatient }, ref) {
  const isEditMode = !!initialPatient?.username;
  const [patientName, setPatientName] = useState(initialPatient?.username ?? searchValue);
  const [age, setAge] = useState(initialPatient?.age ? String(initialPatient.age) : '');
  const [gender, setGender] = useState<Gender | ''>(initialPatient?.biologicalSex ?? '');
  const [mobile, setMobile] = useState(initialPatient?.mobile ?? '');

  const parsedAge = parseInt(age);
  const isValidAge = age !== '' && !isNaN(parsedAge) && parsedAge >= 1 && parsedAge <= 150;
  const isFormValid = patientName.trim() !== '' && isValidAge && gender !== '';

  useImperativeHandle(ref, () => ({
    getPatientData: () => {
      if (!isFormValid) return null;
      return {
        username: patientName.trim(),
        age: parsedAge,
        biologicalSex: gender as Gender,
        mobile: mobileIfEntered(mobile),
      };
    },
  }));

  const handleSave = () => {
    if (!isFormValid) return;
    const data: TSelectedPatientDetails = {
      username: patientName.trim(),
      age: parsedAge,
      biologicalSex: gender as Gender,
      mobile: mobileIfEntered(mobile),
    };
    onSave?.(data);
  };

  return (
    <div className="flex flex-col pt-4 px-3 pb-3 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-medium text-[#1A1A1A]">
          {isEditMode ? 'Edit patient details' : 'Add new patient'}
        </span>
        <button
          onClick={onCancel}
          className="p-0.5 hover:bg-[#F5F5F5] rounded transition-colors cursor-pointer"
        >
          <X className="w-6 h-6 text-[#767676]" />
        </button>
      </div>

      {/* Name field */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[#1A1A1A]">
          Name<span className="text-red-500"> *</span>
        </label>
        <input
          type="text"
          placeholder="Enter full name"
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          autoFocus
          className="h-10 px-3 text-sm bg-[#F5F5F5] border border-[#D1D1D1] rounded-lg outline-none focus:border-primary placeholder:text-[#767676] text-[#1A1A1A]"
        />
      </div>

      {/* Age + Gender row */}
      <div className="flex items-end gap-6">
        {/* Age */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[#1A1A1A]">
            Age<span className="text-red-500"> *</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={age}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || (/^\d+$/.test(v) && parseInt(v) <= 150)) setAge(v);
              }}
              className="h-10 w-16 px-3 text-sm bg-[#F5F5F5] border border-[#D1D1D1] rounded-lg outline-none focus:border-primary text-center text-[#1A1A1A] placeholder:text-[#767676]"
            />
            <span className="text-sm text-[#767676]">years</span>
          </div>
        </div>

        {/* Gender toggle */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[#1A1A1A]">
            Gender<span className="text-red-500"> *</span>
          </label>
          <div className="flex items-stretch gap-1">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setGender(option.value)}
                className={`px-3 py-1.5 text-sm rounded-lg border cursor-pointer transition-colors ${
                  gender === option.value
                    ? 'bg-[#215FFF] text-white border-[#215FFF]'
                    : 'bg-[#F5F5F5] text-[#1A1A1A] border-[#D1D1D1] hover:bg-[#EDEDED]'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[#1A1A1A]">Mobile</label>
        <PhoneInputField value={mobile} onChange={setMobile} />
      </div>

      {/* Save button */}
      <Button
        onClick={handleSave}
        disabled={!isFormValid || isSaving}
        className="h-10 rounded-lg cursor-pointer"
      >
        {isSaving ? 'Saving...' : isEditMode ? 'Save changes' : 'Save and add new patient'}
      </Button>
    </div>
  );
});

export default AddNewPatientForm;
