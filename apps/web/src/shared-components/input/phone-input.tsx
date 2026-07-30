'use client';

import { useRef, useState } from 'react';
import { PhoneInput, PhoneInputRefType } from 'react-international-phone';
import { isValidPhoneNumber } from 'libphonenumber-js';
import 'react-international-phone/style.css';

interface PhoneInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}

const PhoneInputField = ({ value, onChange, disabled, id, placeholder }: PhoneInputFieldProps) => {
  const inputRef = useRef<PhoneInputRefType>(null);
  const [touched, setTouched] = useState(false);

  const hasInput = value.replace(/\D/g, '').length > 3;
  const isInvalid = touched && hasInput && !isValidPhoneNumber(value);

  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.react-international-phone-country-selector')) {
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div onClick={handleContainerClick}>
        <PhoneInput
          ref={inputRef}
          defaultCountry="in"
          value={value}
          onChange={(phone) => onChange(phone)}
          disabled={disabled}
          disableFocusAfterCountrySelect
          disableDialCodeAndPrefix
          disableFormatting
          placeholder={placeholder ?? 'Enter phone number'}
          inputProps={{ id, onBlur: () => setTouched(true) }}
          className={`!border !rounded-lg !bg-[#F5F5F5] !h-10 ${isInvalid ? '!border-red-500' : '!border-[#D1D1D1] focus-within:!border-[#215FFF]'}`}
          inputClassName="!bg-[#F5F5F5] !border-none !outline-none !text-sm !text-[#1A1A1A] !h-full placeholder:!text-[#767676] focus:!ring-0"
          countrySelectorStyleProps={{
            className: '!bg-[#F5F5F5] !border-none !h-full !rounded-l-lg',
            buttonClassName: '!bg-transparent !h-full !px-2 !outline-none !border-y-0 !border-l-0 !border-r !border-[#D1D1D1] focus:!ring-0',
            dropdownStyleProps: {
              style: { maxHeight: '280px', overflowY: 'auto', zIndex: 9999 },
              listItemStyle: { minHeight: '44px', display: 'flex', alignItems: 'center', padding: '0 12px' },
            },
          }}
        />
      </div>
      {isInvalid && (
        <p className="text-xs text-red-500">Enter a valid phone number</p>
      )}
    </div>
  );
}

export default PhoneInputField;