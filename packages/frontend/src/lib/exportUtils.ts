import { toPng, toJpeg, toSvg } from 'html-to-image';
import type { Node, Edge } from '@xyflow/react';
import type { FMEARow } from '../types/diagram';
import { generateLatex } from './tikz';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ExportOptions {
  format: 'svg' | 'png' | 'jpeg' | 'json';
  scale?: number; // 1, 2, or 4 (PNG/JPEG only)
  background?: 'transparent' | 'white';
  quality?: number; // JPEG quality 0-1
}

// ---------------------------------------------------------------------------
// Get the React Flow viewport DOM element
// ---------------------------------------------------------------------------

function getFlowElement(): HTMLElement | null {
  return document.querySelector('.react-flow') as HTMLElement | null;
}

// ---------------------------------------------------------------------------
// Export functions
// ---------------------------------------------------------------------------

export async function exportSvg(options: ExportOptions = { format: 'svg' }): Promise<void> {
  const el = getFlowElement();
  if (!el) return;

  const bgColor = options.background === 'white' ? '#ffffff' : undefined;

  const dataUrl = await toSvg(el, {
    filter: (node) => {
      // Exclude minimap and controls from export
      const classList = (node as HTMLElement).classList;
      if (!classList) return true;
      return (
        !classList.contains('react-flow__minimap') && !classList.contains('react-flow__controls')
      );
    },
    backgroundColor: bgColor,
  });

  await download(dataUrl, 'diagram.svg');
}

export async function exportPng(options: ExportOptions = { format: 'png' }): Promise<void> {
  const el = getFlowElement();
  if (!el) return;

  const scale = options.scale ?? 2;
  const bgColor = options.background === 'white' ? '#ffffff' : undefined;

  const dataUrl = await toPng(el, {
    pixelRatio: scale,
    filter: (node) => {
      const classList = (node as HTMLElement).classList;
      if (!classList) return true;
      return (
        !classList.contains('react-flow__minimap') && !classList.contains('react-flow__controls')
      );
    },
    backgroundColor: bgColor,
  });

  await download(dataUrl, 'diagram.png');
}

export async function exportJpeg(options: ExportOptions = { format: 'jpeg' }): Promise<void> {
  const el = getFlowElement();
  if (!el) return;

  const scale = options.scale ?? 2;
  const quality = options.quality ?? 0.95;

  const dataUrl = await toJpeg(el, {
    pixelRatio: scale,
    quality,
    backgroundColor: '#ffffff', // JPEG always has a background
    filter: (node) => {
      const classList = (node as HTMLElement).classList;
      if (!classList) return true;
      return (
        !classList.contains('react-flow__minimap') && !classList.contains('react-flow__controls')
      );
    },
  });

  await download(dataUrl, 'diagram.jpg');
}

export async function exportJson(
  nodes: unknown[],
  edges: unknown[],
  diagramType: string,
  diagramName: string,
): Promise<void> {
  const data = {
    // Bump when the file format changes incompatibly; the importer refuses
    // files newer than it understands and treats absent as 1 (pre-versioning).
    schemaVersion: 1,
    name: diagramName,
    type: diagramType,
    exportedAt: new Date().toISOString(),
    nodes,
    edges,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  await download(url, `${diagramName || 'diagram'}.json`);
  URL.revokeObjectURL(url);
}

export async function exportLatex(
  nodes: Node[],
  edges: Edge[],
  diagramType: string,
  diagramName: string,
  fmeaRows: FMEARow[] = [],
): Promise<void> {
  const tex = generateLatex(diagramType, nodes, edges, fmeaRows);
  const blob = new Blob([tex], { type: 'application/x-tex' });
  const url = URL.createObjectURL(blob);
  await download(url, `${diagramName || 'diagram'}.tex`);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

/**
 * File System Access API, typed minimally (not in the default DOM lib).
 * `id` is what makes the browser reopen the picker in the folder last used for
 * THIS id — so exports and imports remember separate directories.
 */
export const EXPORT_PICKER_ID = 'ramsey-export';

interface SaveFilePickerOptions {
  id?: string;
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}
interface FileSystemWritableStream {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}
interface SaveFileHandle {
  createWritable: () => Promise<FileSystemWritableStream>;
}

/** Separate id from EXPORT_PICKER_ID, so importing and exporting each reopen
 *  in their own last-used folder. */
export const IMPORT_PICKER_ID = 'ramsey-import';

interface OpenFilePickerOptions {
  id?: string;
  multiple?: boolean;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}
interface OpenFileHandle {
  getFile: () => Promise<File>;
}

export type PickedFile =
  | { status: 'ok'; text: string }
  | { status: 'cancelled' }
  /** No File System Access API here — the caller should fall back to <input type="file">. */
  | { status: 'unsupported' };

/** Open a JSON file through the native picker, remembering the import folder. */
export async function pickJsonFile(): Promise<PickedFile> {
  const showOpenFilePicker = (
    window as unknown as {
      showOpenFilePicker?: (opts: OpenFilePickerOptions) => Promise<OpenFileHandle[]>;
    }
  ).showOpenFilePicker;
  if (!showOpenFilePicker) return { status: 'unsupported' };

  try {
    const [handle] = await showOpenFilePicker({
      id: IMPORT_PICKER_ID,
      multiple: false,
      types: [{ description: 'Diagram JSON', accept: { 'application/json': ['.json'] } }],
    });
    if (!handle) return { status: 'cancelled' };
    return { status: 'ok', text: await (await handle.getFile()).text() };
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return { status: 'cancelled' };
    return { status: 'unsupported' };
  }
}

const MIME_BY_EXT: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  json: 'application/json',
  tex: 'application/x-tex',
};

/**
 * Save `dataUrl` as `filename`.
 *
 * Where supported (Chromium), opens a real save dialog so the user picks the
 * folder and name, reopening wherever they last exported. Firefox/Safari have no
 * such API, so they fall back to an anchor download (the browser's download
 * folder, or wherever its "always ask" setting sends it).
 */
async function download(dataUrl: string, filename: string): Promise<void> {
  const showSaveFilePicker = (
    window as unknown as {
      showSaveFilePicker?: (opts: SaveFilePickerOptions) => Promise<SaveFileHandle>;
    }
  ).showSaveFilePicker;

  if (showSaveFilePicker) {
    const ext = filename.split('.').pop() ?? '';
    const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    try {
      const handle = await showSaveFilePicker({
        id: EXPORT_PICKER_ID,
        suggestedName: filename,
        types: [{ description: ext.toUpperCase(), accept: { [mime]: [`.${ext}`] } }],
      });
      // Works for both data: and blob: URLs.
      const blob = await (await fetch(dataUrl)).blob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // Cancelling the dialog is not a failure.
      if ((err as DOMException)?.name === 'AbortError') return;
      // Anything else (e.g. a blocked cross-origin fetch): fall back below.
    }
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
