'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table,
  Minus,
} from 'lucide-react';
import type { SlashCommandItem } from './slash-command';

const iconMap: Record<string, React.ReactNode> = {
  H1: <Heading1 className="w-4 h-4" />,
  H2: <Heading2 className="w-4 h-4" />,
  H3: <Heading3 className="w-4 h-4" />,
  List: <List className="w-4 h-4" />,
  ListOrdered: <ListOrdered className="w-4 h-4" />,
  Quote: <Quote className="w-4 h-4" />,
  Table: <Table className="w-4 h-4" />,
  Minus: <Minus className="w-4 h-4" />,
};

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListHandle, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    // Scroll selected item into view
    useLayoutEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const selected = container.querySelector('[data-selected="true"]') as HTMLElement | null;
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }, [selectedIndex]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-md p-2 text-sm text-muted-foreground">
          No results
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="bg-popover border border-border rounded-lg shadow-md py-1 max-h-64 overflow-y-auto w-56"
      >
        {items.map((item, index) => (
          <button
            key={item.title}
            data-selected={index === selectedIndex}
            onClick={() => selectItem(index)}
            className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 text-left text-sm transition-colors ${
              index === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-accent/50'
            }`}
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-md border border-border bg-background shrink-0">
              {iconMap[item.icon] || null}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="font-medium truncate">{item.title}</span>
              <span className="text-xs text-muted-foreground truncate">{item.description}</span>
            </div>
          </button>
        ))}
      </div>
    );
  }
);

SlashCommandList.displayName = 'SlashCommandList';

export default SlashCommandList;
