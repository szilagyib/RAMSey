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
        !classList.contains('react-flow__minimap') &&
        !classList.contains('react-flow__controls')
      );
    },
    backgroundColor: bgColor,
  });

  download(dataUrl, 'diagram.svg');
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
        !classList.contains('react-flow__minimap') &&
        !classList.contains('react-flow__controls')
      );
    },
    backgroundColor: bgColor,
  });

  download(dataUrl, 'diagram.png');
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
        !classList.contains('react-flow__minimap') &&
        !classList.contains('react-flow__controls')
      );
    },
  });

  download(dataUrl, 'diagram.jpg');
}

export function exportJson(
  nodes: unknown[],
  edges: unknown[],
  diagramType: string,
  diagramName: string,
): void {
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
  download(url, `${diagramName || 'diagram'}.json`);
  URL.revokeObjectURL(url);
}

export function exportLatex(
  nodes: Node[],
  edges: Edge[],
  diagramType: string,
  diagramName: string,
  fmeaRows: FMEARow[] = [],
): void {
  const tex = generateLatex(diagramType, nodes, edges, fmeaRows);
  const blob = new Blob([tex], { type: 'application/x-tex' });
  const url = URL.createObjectURL(blob);
  download(url, `${diagramName || 'diagram'}.tex`);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function download(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
