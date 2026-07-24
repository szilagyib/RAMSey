import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDiagramStore } from '../../stores/diagramStore';
import { useFMEAStore } from '../../stores/fmeaStore';
import { exportSvg, exportPng, exportJpeg, exportJson, exportLatex } from '../../lib/exportUtils';
import { cn } from '../../lib/utils';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  diagramName: string;
}

type Format = 'svg' | 'png' | 'jpeg' | 'json' | 'latex';
type Scale = 1 | 2 | 4;
type Background = 'transparent' | 'white';

export function ExportDialog({ open, onClose, diagramName }: ExportDialogProps) {
  const [format, setFormat] = useState<Format>('png');
  const [scale, setScale] = useState<Scale>(2);
  const [background, setBackground] = useState<Background>('white');
  const [exporting, setExporting] = useState(false);

  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const diagramType = useDiagramStore((s) => s.diagramType);
  const fmeaRows = useFMEAStore((s) => s.rows);

  if (!open) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      switch (format) {
        case 'svg':
          await exportSvg({ format: 'svg', background });
          break;
        case 'png':
          await exportPng({ format: 'png', scale, background });
          break;
        case 'jpeg':
          await exportJpeg({ format: 'jpeg', scale });
          break;
        case 'json':
          await exportJson(nodes, edges, diagramType, diagramName);
          break;
        case 'latex':
          await exportLatex(nodes, edges, diagramType, diagramName, fmeaRows);
          break;
      }
      onClose();
    } catch (err) {
      window.alert(`Export failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg border border-surface-200 bg-white dark:bg-surface-100 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-surface-800">Export Diagram</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-5 py-4">
          {/* Format */}
          <div>
            <label className="mb-2 block text-xs font-medium text-surface-600">Format</label>
            <div className="flex flex-wrap gap-2">
              {(['svg', 'png', 'jpeg', 'json', 'latex'] as Format[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    format === f
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-surface-300 text-surface-600 hover:bg-surface-50',
                  )}
                >
                  {f === 'latex' ? 'LaTeX' : f.toUpperCase()}
                </button>
              ))}
            </div>
            {format === 'latex' && (
              <p className="mt-2 text-[11px] text-surface-400">
                Standalone TikZ document (.tex) — paste into Overleaf and compile.
              </p>
            )}
          </div>

          {/* Scale (PNG/JPEG only) */}
          {(format === 'png' || format === 'jpeg') && (
            <div>
              <label className="mb-2 block text-xs font-medium text-surface-600">Scale</label>
              <div className="flex gap-2">
                {([1, 2, 4] as Scale[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                      scale === s
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-surface-300 text-surface-600 hover:bg-surface-50',
                    )}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Background (SVG/PNG only) */}
          {(format === 'svg' || format === 'png') && (
            <div>
              <label className="mb-2 block text-xs font-medium text-surface-600">Background</label>
              <div className="flex gap-2">
                {(['white', 'transparent'] as Background[]).map((bg) => (
                  <button
                    key={bg}
                    onClick={() => setBackground(bg)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                      background === bg
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-surface-300 text-surface-600 hover:bg-surface-50',
                    )}
                  >
                    {bg}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-surface-200 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </div>
    </div>
  );
}
