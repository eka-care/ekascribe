import { ArrowUp, ArrowDown } from 'lucide-react';

interface JumpToSelectedChipProps {
  direction: 'up' | 'down';
  onClick: () => void;
}

const JumpToSelectedChip = ({ direction, onClick }: JumpToSelectedChipProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`jump-to-selected-chip jump-to-selected-chip--${direction}`}
    >
      {direction === 'up' ? (
        <ArrowUp size={14} aria-hidden />
      ) : (
        <ArrowDown size={14} aria-hidden />
      )}
      Jump to selected
    </button>
  );
};

export default JumpToSelectedChip;
