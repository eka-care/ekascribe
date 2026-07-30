'use client';

import { RefObject } from 'react';
import { Plus, Search } from 'lucide-react';
import useVoice2RxStore from '@/store/store';
import { TSearchPatient } from '@/constants/types';

interface PatientSuggestionsProps {
  searchValue: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  isSearching: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (patient: TSearchPatient) => void;
  onAddNewPatient: () => void;
}

export function PatientSuggestions({
  searchValue,
  searchInputRef,
  isSearching,
  onSearchChange,
  onSelect,
  onAddNewPatient,
}: PatientSuggestionsProps) {
  const searchedPatientsList = useVoice2RxStore((state) => state.searchedPatientsList);

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const getGenderLabel = (gen?: string) => {
    if (!gen) return '';
    if (gen === 'M') return 'M';
    if (gen === 'F') return 'F';
    return 'O';
  };

  return (
    <div className="flex flex-col">
      {/* Search input */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-1 bg-[#EDEDED] rounded-lg px-2 h-9">
          <Search className="w-4 h-4 text-[#767676] shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by name or mobile number"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 text-sm outline-none border-none bg-transparent placeholder:text-[#767676] text-[#1A1A1A]"
          />
        </div>
      </div>

      {/* FREQUENT PATIENTS header */}
      {!isSearching && searchedPatientsList.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <span className="text-xs font-semibold text-[#767676] tracking-wider uppercase opacity-50">
            Frequent Patients
          </span>
        </div>
      )}

      {/* Patient list */}
      <div className="max-h-52 overflow-y-auto">
        {!isSearching && searchedPatientsList.length > 0 && (
          <div className="flex flex-col">
            {searchedPatientsList.map((patient) => (
              <button
                key={patient.oid}
                onClick={() => onSelect(patient)}
                className="flex items-center gap-2.5 px-4 py-2 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left"
              >
                <div className="w-8 h-8 rounded-full bg-[#BFDBFE] flex items-center justify-center shrink-0">
                  <span className="text-sm font-medium text-[#215FFF]">
                    {getInitial(patient.username || '')}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-medium text-[#1A1A1A] truncate">
                    {[patient.username, patient.age || null, getGenderLabel(patient.gen)]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {isSearching && (
          <div className="flex items-center justify-center h-10 px-3">
            <span className="text-sm text-[#767676]">Searching...</span>
          </div>
        )}

        {/* No results */}
        {!isSearching && searchValue.length >= 2 && searchedPatientsList.length === 0 && (
          <div className="flex items-center justify-center h-10 px-3">
            <span className="text-sm text-[#767676]">No patients found</span>
          </div>
        )}
      </div>

      {/* Add new patient */}
      <button
        onClick={onAddNewPatient}
        className="flex items-center gap-2 px-4 py-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left border-t border-[#D1D1D1]"
      >
        <div className="w-8 h-8 rounded-full bg-[#BFDBFE] flex items-center justify-center shrink-0">
          <Plus className="w-4 h-4 text-[#215FFF]" />
        </div>
        <span className="text-sm font-medium text-[#215FFF]">Add new patient</span>
      </button>
    </div>
  );
}
