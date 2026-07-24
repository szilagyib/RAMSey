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

/** Non-interactive label, used to name each group inside the overflow menu. */
export interface MenuHeading {
  heading: string;
}

export type MenuEntry = MenuItem | MenuDivider | MenuHeading;

export interface MenuDefinition {
  label: string;
  items: MenuEntry[];
}

function isDivider(entry: MenuEntry): entry is MenuDivider {
  return 'divider' in entry;
}

function isHeading(entry: MenuEntry): entry is MenuHeading {
  return 'heading' in entry;
}

// ---------------------------------------------------------------------------
// Single dropdown menu
// ---------------------------------------------------------------------------

function DropdownMenu({
  menu,
  isOpen,
  onToggle,
  onHover,
  align = 'left',
}: {
  menu: MenuDefinition;
  isOpen: boolean;
  onToggle: () => void;
  onHover: () => void;
  /** Anchor the panel to the button's right edge when it sits near the screen edge. */
  align?: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Reserve a check column for every item once any item in the menu is a toggle,
  // so labels line up in a 2-column grid and don't shift when checked/unchecked.
  const hasCheckable = menu.items.some(
    (e) => !isDivider(e) && !isHeading(e) && e.checked !== undefined,
  );

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
        <div
          className={cn(
            'absolute top-full z-50 mt-0.5 min-w-48 rounded-md border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-300 dark:bg-surface-100',
            // Never taller than the viewport allows, and never wider than it:
            // the combined "…" menu is long enough to run off a phone screen.
            'max-h-[70vh] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {menu.items.map((entry, i) => {
            if (isDivider(entry)) {
              return <div key={`div-${i}`} className="my-1 border-t border-surface-100" />;
            }

            if (isHeading(entry)) {
              return (
                <div
                  key={`head-${entry.heading}`}
                  className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-400"
                >
                  {entry.heading}
                </div>
              );
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
  /**
   * How many menus stay on the bar on a phone; the rest move into a "…" menu.
   * All of them are shown from `sm` up. Both variants render — which one is
   * visible is decided in CSS, so there is no resize listener or layout thrash.
   */
  mobileVisible?: number;
}

export function MenuBar({ menus, mobileVisible = 1 }: MenuBarProps) {
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
      if (isDivider(entry) || isHeading(entry)) return entry;
      return {
        ...entry,
        onClick: () => {
          entry.onClick();
          setOpenIndex(null);
        },
      };
    }),
  }));

  // The phone-only "…" menu: every menu that doesn't fit, each under its own
  // heading so File/Edit/View stay distinguishable in one list.
  const overflowMenu: MenuDefinition = {
    label: '…',
    items: wrappedMenus
      .slice(mobileVisible)
      .flatMap((menu, i) => [
        ...(i > 0 ? [{ divider: true as const }] : []),
        { heading: menu.label },
        ...menu.items,
      ]),
  };
  const overflowIndex = wrappedMenus.length;

  // Close on Escape
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpenIndex(null);
  }, []);

  return (
    <div ref={barRef} className="flex items-center gap-0.5" onKeyDown={handleKeyDown}>
      {wrappedMenus.map((menu, i) => (
        <div key={menu.label} className={i < mobileVisible ? undefined : 'hidden sm:block'}>
          <DropdownMenu
            menu={menu}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            onHover={() => {
              // If any menu is open, hovering switches to this one
              if (openIndex !== null) setOpenIndex(i);
            }}
          />
        </div>
      ))}

      {overflowMenu.items.length > 0 && (
        <div className="sm:hidden">
          <DropdownMenu
            menu={overflowMenu}
            align="right"
            isOpen={openIndex === overflowIndex}
            onToggle={() => setOpenIndex(openIndex === overflowIndex ? null : overflowIndex)}
            onHover={() => {
              if (openIndex !== null) setOpenIndex(overflowIndex);
            }}
          />
        </div>
      )}
    </div>
  );
}
