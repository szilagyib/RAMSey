import { useState, useRef, useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Renders a check column; toggles/radios set this instead of prefixing the label. */
  checked?: boolean;
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
  // Reserve a check column for every item once any item in the menu is a toggle,
  // so labels line up in a 2-column grid and don't shift when checked/unchecked.
  const hasCheckable = menu.items.some((e) => !isDivider(e) && e.checked !== undefined);

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
                    ? 'cursor-default text-surface-400'
                    : 'text-surface-700 hover:bg-surface-50',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {hasCheckable && (
                    <Check
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        entry.checked ? 'text-primary-600' : 'opacity-0',
                      )}
                    />
                  )}
                  <span className="truncate">{entry.label}</span>
                </span>
                {entry.shortcut && (
                  <span
                    className={cn(
                      'ml-6 text-[10px]',
                      // Muted-but-legible when disabled; stronger when active — so
                      // the shortcut tracks the label and disabled stays distinct.
                      entry.disabled ? 'text-surface-400' : 'text-surface-500',
                    )}
                  >
                    {entry.shortcut}
                  </span>
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
