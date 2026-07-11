import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Trash2, LogOut, Users, Settings } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { NotificationBell } from '../components/NotificationBell';
import { Select } from '../components/ui/Select';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { getAllDiagramTypes } from '../diagram-types/registry';
import { toBackendType } from '../lib/diagramTypeMapping';
import { getDataService } from '../services/dataService';
import { useAuth } from '../contexts/auth';

interface DiagramEntry {
  projectId: string;
  projectName: string;
  ownerType: string;
  ownerId: string;
  diagramId: string;
  diagramName: string;
  diagramType: string;
  updatedAt: string;
}

// Color accent per diagram type (used for the top card stripe)
function typeAccentColor(backendType: string): string {
  const t = backendType.toLowerCase();
  if (t.includes('markov'))                               return '#6bca8a'; // green
  if (t.includes('fault'))                                return '#4c7bd6'; // blue
  if (t.includes('event_tree') || t.includes('event'))   return '#e2a84c'; // amber
  if (t.includes('block') || t.includes('rbd'))          return '#f472b6'; // pink
  if (t.includes('bow'))                                  return '#a78bfa'; // violet
  if (t.includes('fmea'))                                 return '#94a3b8'; // slate
  return '#94a3b8';
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, isGuest } = useAuth();
  const [entries, setEntries] = useState<DiagramEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('markov_chain');

  const diagramTypes = getAllDiagramTypes();
  const ds = getDataService(user?.id);

  const loadEntries = useCallback(async () => {
    try {
      const projectsRes = await ds.projects.list();
      const projects = projectsRes.data;
      const all: DiagramEntry[] = [];

      for (const project of projects) {
        const diagramsRes = await ds.diagrams.list(project.id);
        const diagrams = diagramsRes.data as {
          id: string;
          name: string;
          type: string;
          updatedAt: string;
        }[];
        for (const d of diagrams) {
          all.push({
            projectId: project.id,
            projectName: project.name,
            ownerType: (project as { ownerType?: string }).ownerType ?? 'user',
            ownerId: (project as { ownerId?: string }).ownerId ?? user?.id ?? '',
            diagramId: d.id,
            diagramName: d.name,
            diagramType: d.type,
            updatedAt: d.updatedAt,
          });
        }
      }

      setEntries(all);
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, [ds, user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount; state updates happen after await, not synchronously
    loadEntries();
  }, [loadEntries]);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const projectRes = await ds.projects.create({ name: newName.trim(), ownerId: user!.id });
      const project = projectRes.data as { id: string };
      const diagramRes = await ds.diagrams.create(project.id, {
        name: newName.trim(),
        type: toBackendType(newType),
      });
      const diagram = diagramRes.data as { id: string };
      setNewName('');
      setNewType('markov_chain');
      setShowForm(false);
      navigate(`/projects/${project.id}/diagrams/${diagram.id}`);
    } catch (err) {
      window.alert(`Failed to create diagram: ${err}`);
    }
  }

  async function handleDelete(entry: DiagramEntry) {
    if (!window.confirm(`Delete "${entry.diagramName}"?`)) return;
    try {
      await ds.diagrams.delete(entry.projectId, entry.diagramId);
      await ds.projects.delete(entry.projectId);
      await loadEntries();
    } catch (err) {
      window.alert(`Failed to delete: ${err}`);
    }
  }

  async function handleLogout() {
    await logout();
    if (!isGuest) {
      window.location.href = '/login';
    }
  }

  const typeLabel = (backendType: string): string => {
    const found = diagramTypes.find((dt) => toBackendType(dt.id) === backendType);
    return found?.name ?? backendType;
  };

  const myEntries     = isGuest
    ? entries
    : entries.filter((e) => e.ownerType === 'user' && e.ownerId === user?.id);
  const teamEntries   = isGuest ? [] : entries.filter((e) => e.ownerType === 'team');
  const sharedEntries = isGuest ? [] : entries.filter((e) => e.ownerType === 'user' && e.ownerId !== user?.id);

  const isEmpty = !loading && entries.length === 0;

  function renderSection(title: string, items: DiagramEntry[]) {
    if (items.length === 0) return null;
    return (
      <div className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-400">{title}</h2>
          <span className="rounded-full bg-surface-100 dark:bg-surface-300 px-2 py-0.5 font-mono text-[11px] text-surface-500 dark:text-surface-600">
            {items.length}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((entry) => (
            <div
              key={entry.diagramId}
              className="group relative rounded-lg border border-surface-200 dark:border-surface-300 bg-white dark:bg-surface-100 overflow-hidden transition-all hover:shadow-md hover:border-surface-300 dark:hover:border-surface-400"
            >
              {/* Type color accent bar */}
              <div
                className="h-[3px]"
                style={{ backgroundColor: typeAccentColor(entry.diagramType) }}
              />
              <div className="flex items-start justify-between p-4">
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/projects/${entry.projectId}/diagrams/${entry.diagramId}`)
                  }
                  className="flex-1 text-left"
                >
                  <h3 className="font-medium text-surface-800 group-hover:text-primary-600 transition-colors">
                    {entry.diagramName}
                  </h3>
                  <span
                    className="mt-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium"
                    style={{
                      backgroundColor: typeAccentColor(entry.diagramType) + '22',
                      color: typeAccentColor(entry.diagramType),
                    }}
                  >
                    {typeLabel(entry.diagramType)}
                  </span>
                  <p className="mt-2.5 text-xs text-surface-400">
                    {new Date(entry.updatedAt).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                </button>
                <button
                  onClick={() => handleDelete(entry)}
                  className="ml-2 mt-0.5 rounded p-1 text-surface-300 hover:bg-surface-100 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="border-b border-surface-200 bg-white dark:bg-surface-100 px-6">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="RAMSey" className="h-7 w-7" />
            <span className="text-base font-semibold tracking-tight text-surface-900">RAMSey</span>
          </div>
          <div className="flex items-center gap-1">
            {isGuest ? (
              <>
                <span className="flex items-center gap-1.5 rounded-full border border-surface-200 dark:border-surface-400 bg-surface-50 dark:bg-surface-200 px-2.5 py-1 text-[11px] font-medium text-surface-400 dark:text-surface-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-surface-300 dark:bg-surface-500" />
                  Local mode
                </span>
                <span className="mx-1 h-4 w-px bg-surface-200" />
                <Link
                  to="/login"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-surface-200 hover:text-primary-700 transition-colors"
                >
                  Sign in
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/teams"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-surface-500 hover:bg-surface-50 hover:text-surface-700 transition-colors"
                >
                  <Users className="h-4 w-4" />
                  Teams
                </Link>
                <NotificationBell />
                <Link
                  to="/account"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-surface-500 hover:bg-surface-50 hover:text-surface-700 transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  Account
                </Link>
                <span className="mx-1 h-4 w-px bg-surface-200" />
                <span className="px-2 text-sm text-surface-500">{user?.name ?? user?.email}</span>
                <button
                  onClick={handleLogout}
                  className="rounded-md p-1.5 text-surface-400 hover:bg-surface-50 hover:text-surface-600 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading && (
          <p className="text-sm text-surface-400">Loading…</p>
        )}

        {/* Empty state */}
        {isEmpty && !showForm && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-200">
              <img src="/favicon.svg" alt="RAMSey" className="h-9 w-9 opacity-40" />
            </div>
            <h2 className="mb-1.5 text-base font-medium text-surface-700">No diagrams yet</h2>
            <p className="mb-8 text-sm text-surface-400">
              Create your first reliability analysis diagram to get started.
            </p>
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Diagram
            </Button>
          </div>
        )}

        {/* Header row when diagrams exist */}
        {!isEmpty && !loading && (
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight text-surface-900">Diagrams</h1>
            <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Diagram
            </Button>
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <div className="mb-8 rounded-lg border border-surface-200 dark:border-surface-300 bg-white dark:bg-surface-100 p-6">
            <h3 className="mb-5 text-sm font-semibold text-surface-700">New Diagram</h3>
            <div className="flex flex-col gap-4">
              <Input
                label="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Pump System Reliability"
                autoFocus
              />
              <Select
                label="Diagram Type"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                options={diagramTypes.map((dt) => ({
                  value: dt.id,
                  label: dt.name,
                }))}
              />
              {(() => {
                const selected = diagramTypes.find((dt) => dt.id === newType);
                return selected ? (
                  <p className="text-xs text-surface-400">{selected.description}</p>
                ) : null;
              })()}
              <div className="flex gap-2 pt-1">
                <Button onClick={handleCreate} disabled={!newName.trim()}>
                  Create
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Diagram sections */}
        {!loading && entries.length > 0 && (
          <>
            {renderSection('My Diagrams', myEntries)}
            {renderSection('Team Diagrams', teamEntries)}
            {renderSection('Shared with Me', sharedEntries)}
          </>
        )}
      </main>
    </div>
  );
}
