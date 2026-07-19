import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DiagramTitle } from '../../../src/components/editor/DiagramTitle';

afterEach(cleanup);

/** Open the editor and type a new name into it. */
function edit(next: string) {
  fireEvent.click(screen.getByTitle('Rename diagram'));
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: next } });
  return input;
}

describe('DiagramTitle', () => {
  it('renders nothing before the name has loaded', () => {
    const { container } = render(<DiagramTitle name="" onRename={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('commits a new name on Enter', () => {
    const onRename = vi.fn();
    render(<DiagramTitle name="Pump A" onRename={onRename} />);

    fireEvent.keyDown(edit('Pump B'), { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('Pump B');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('discards a blank name — an empty header would lose the diagram', () => {
    const onRename = vi.fn();
    render(<DiagramTitle name="Pump A" onRename={onRename} />);

    fireEvent.keyDown(edit('   '), { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByTitle('Rename diagram').textContent).toBe('Pump A');
  });

  it('cancels on Escape, keeping the old name', () => {
    const onRename = vi.fn();
    render(<DiagramTitle name="Pump A" onRename={onRename} />);

    fireEvent.keyDown(edit('Pump B'), { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByTitle('Rename diagram').textContent).toBe('Pump A');
  });

  it('does not fire for an unchanged name', () => {
    const onRename = vi.fn();
    render(<DiagramTitle name="Pump A" onRename={onRename} />);

    fireEvent.keyDown(edit('Pump A'), { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
  });
});
