const CheckCircleFillIcon = ({ color, size = 16 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8.00016 14.6654C11.6821 14.6654 14.6668 11.6806 14.6668 7.9987C14.6668 4.3168 11.6821 1.33203 8.00016 1.33203C4.31826 1.33203 1.3335 4.3168 1.3335 7.9987C1.3335 11.6806 4.31826 14.6654 8.00016 14.6654Z"
      fill={color}
    />
    <path
      d="M6.00016 7.9987L7.3335 9.33203L10.0002 6.66536M14.6668 7.9987C14.6668 11.6806 11.6821 14.6654 8.00016 14.6654C4.31826 14.6654 1.3335 11.6806 1.3335 7.9987C1.3335 4.3168 4.31826 1.33203 8.00016 1.33203C11.6821 1.33203 14.6668 4.3168 14.6668 7.9987Z"
      stroke="white"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default CheckCircleFillIcon;
