const PricingCardCircleCheckIcon = ({ iconSize = 5 }: { iconSize?: number }) => {
  const iconSizeClass = `w-${iconSize} h-${iconSize}`;
  const tickSizeClass = `w-${iconSize - 2} h-${iconSize - 2}`;
  return (
    <div
      className={`${iconSizeClass} rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0`}
    >
      <svg
        className={`${tickSizeClass} text-blue-600`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
};

export default PricingCardCircleCheckIcon;
