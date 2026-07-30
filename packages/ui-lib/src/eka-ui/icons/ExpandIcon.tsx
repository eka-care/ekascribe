import React from 'react';
import { TIconProps } from '../types';

const ExpandIcon: React.FC<TIconProps> = ({ className = '', size = 16 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M8 3H5A2 2 0 0 0 3 5V8M21 8V5A2 2 0 0 0 19 3H16M16 21H19A2 2 0 0 0 21 19V16M8 21H5A2 2 0 0 1 3 19V16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default ExpandIcon;
