import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface MenuDivider {
  divider: true;
}

export type MenuEntry = MenuItem | MenuDivider;

export interface MenuDefinition {
  label: string;
  items: MenuEntry[];
}

function isDivider(entry: MenuEntry): entry is MenuDivider {
  return 'divider' in entry;
}

// ---------------------------------------------------------------------------
// Single dropdown menu
// ---------------------------------------------------------------------------

function DropdownMenu({
  menu,
  isOpen,
  onToggle,
  onHover,
}: {
  menu: MenuDefinition;
  isOpen: boolean;
  onToggle: () => void;
  onHover: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onToggle}
        onMouseEnter={onHover}
        className={cn(
          'rounded px-2.5 py-1 text-xs font-medium transition-colors',
          isOpen
            ? 'bg-surface-100 text-surface-900'
            : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900',
        )}
      >
        {menu.label}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-0.5 min-w-48 rounded-md border border-surface-200 bg-white dark:bg-surface-100 dark:border-surface-300 py-1 shadow-lg">
          {menu.items.map((entry, i) => {
            if (isDivider(entry)) {
              return <div key={`div-${i}`} className="my-1 border-t border-surface-100" />;
            }

            return (
              <button
                key={entry.label}
                onClick={() => {
                  if (!entry.disabled) {
                    entry.onClick();
                  }
                }}
                disabled={entry.disabled}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs',
                  entry.disabled
                    ? 'cursor-default text-surface-300'
                    : 'text-surface-700 hover:bg-surface-50',
                )}
              >
                <span>{entry.label}</span>
                {entry.shortcut && (
                  <span className="ml-6 text-[10px] text-surface-400">{entry.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MenuBar
// ---------------------------------------------------------------------------

interface MenuBarProps {
  menus: MenuDefinition[];
}

export function MenuBar({ menus }: MenuBarProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (openIndex === null) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openIndex]);

  // Close on item click — wrap menu items to auto-close
  const wrappedMenus = menus.map((menu) => ({
    ...menu,
    items: menu.items.map((entry) => {
      if (isDivider(entry)) return entry;
      return {
        ...entry,
        onClick: () => {
          entry.onClick();
          setOpenIndex(null);
        },
      };
    }),
  }));

  // Close on Escape
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpenIndex(null);
  }, []);

  return (
    <div ref={barRef} className="flex items-center gap-0.5" onKeyDown={handleKeyDown}>
      {wrappedMenus.map((menu, i) => (
        <DropdownMenu
          key={menu.label}
          menu={menu}
          isOpen={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          onHover={() => {
            // If any menu is open, hovering switches to this one
            if (openIndex !== null) setOpenIndex(i);
          }}
        />
      ))}
    </div>
  );
}
