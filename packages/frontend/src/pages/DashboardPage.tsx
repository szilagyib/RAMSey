import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Pencil,
  LogOut,
  Users,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { NotificationBell } from '../components/NotificationBell';
import { Select } from '../components/ui/Select';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { getAllDiagramTypes } from '../diagram-types/registry';
import { toBackendType } from '../lib/diagramTypeMapping';
import { getDataService } from '../services/dataService';
import { api } from '../services/api';
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
  if (t.includes('markov')) return '#6bca8a'; // green
  if (t.includes('fault')) return '#4c7bd6'; // blue
  if (t.includes('event_tree') || t.includes('event')) return '#e2a84c'; // amber
  if (t.includes('block') || t.includes('rbd')) return '#f472b6'; // pink
  if (t.includes('bow')) return '#a78bfa'; // violet
  if (t.includes('fmea')) return '#94a3b8'; // slate
  return '#94a3b8';
}

interface TeamOption {
  id: string;
  name: string;
  slug: string;
  role: 'ADMIN' | 'MEMBER';
}

// Which team sections are folded shut. A workspace layout choice, so it sticks —
// the same reasoning as the editor's side panels.
const COLLAPSED_TEAMS_KEY = 'ramsey-collapsed-teams';

function loadCollapsedTeams(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_TEAMS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, isGuest } = useAuth();
  const [entries, setEntries] = useState<DiagramEntry[]>([]);
  /** Diagram whose title is being edited inline on its card. */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('markov_chain');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  // 'user' = my own; otherwise the id of the team that will own it.
  const [newOwner, setNewOwner] = useState('user');
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(loadCollapsedTeams);

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

  // A guest has no teams, and no server to ask.
  useEffect(() => {
    if (isGuest) return;
    api.teams
      .list()
      .then((res) => setTeams(res.data))
      .catch(() => setTeams([])); // teams are a nicety here; a failure must not blank the dashboard
  }, [isGuest]);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      // Only admins may own a project under a team — the server enforces it, so
      // the picker only ever offers teams where this user is one.
      const owner =
        newOwner === 'user'
          ? { ownerType: 'user' as const, ownerId: user!.id }
          : { ownerType: 'team' as const, ownerId: newOwner };
      const projectRes = await ds.projects.create({ name: newName.trim(), ...owner });
      const project = projectRes.data as { id: string };
      const diagramRes = await ds.diagrams.create(project.id, {
        name: newName.trim(),
        type: toBackendType(newType),
      });
      const diagram = diagramRes.data as { id: string };
      setNewName('');
      setNewType('markov_chain');
      setNewOwner('user');
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

  /**
   * Commit an inline rename. The card updates immediately and the request goes
   * out behind it — reloading every project just to show one new title made the
   * rename feel broken. A failure puts the old name back and says so.
   */
  async function commitRename(entry: DiagramEntry, rawName: string) {
    const name = rawName.trim();
    setRenamingId(null);
    if (!name || name === entry.diagramName) return;

    const previous = entry.diagramName;
    setEntries((prev) =>
      prev.map((e) => (e.diagramId === entry.diagramId ? { ...e, diagramName: name } : e)),
    );
    try {
      await ds.diagrams.update(entry.projectId, entry.diagramId, { name });
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) => (e.diagramId === entry.diagramId ? { ...e, diagramName: previous } : e)),
      );
      window.alert(`Failed to rename: ${err}`);
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

  const myEntries = isGuest
    ? entries
    : entries.filter((e) => e.ownerType === 'user' && e.ownerId === user?.id);
  const teamEntries = isGuest ? [] : entries.filter((e) => e.ownerType === 'team');
  const sharedEntries = isGuest
    ? []
    : entries.filter((e) => e.ownerType === 'user' && e.ownerId !== user?.id);

  const isEmpty = !loading && entries.length === 0;

  // Only admins may own a project under a team (enforced server-side).
  const adminTeams = teams.filter((t) => t.role === 'ADMIN');

  const toggleTeam = (teamId: string) => {
    setCollapsedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      localStorage.setItem(COLLAPSED_TEAMS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  /**
   * Team diagrams, grouped by the team that owns them.
   *
   * A flat "Team" list said nothing about *which* team a diagram belonged to,
   * which stops working the moment you're in two of them. Teams with nothing in
   * them are still listed: a team you belong to that silently vanished from the
   * page would read as a bug, not as an empty state.
   */
  function renderTeamSections() {
    if (isGuest || teams.length === 0) return null;

    return (
      <div className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <h2 className="text-xs font-semibold tracking-wider text-surface-400 uppercase">
            Team Diagrams
          </h2>
          <span className="rounded-full bg-surface-100 px-2 py-0.5 font-mono text-[11px] text-surface-500 dark:bg-surface-300 dark:text-surface-600">
            {teamEntries.length}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {teams.map((team) => {
            const items = teamEntries.filter((e) => e.ownerId === team.id);
            const collapsed = collapsedTeams.has(team.id);
            return (
              <div
                key={team.id}
                className="rounded-lg border border-surface-200 dark:border-surface-300"
              >
                <button
                  onClick={() => toggleTeam(team.id)}
                  aria-expanded={!collapsed}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-50 dark:hover:bg-surface-200"
                >
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4 text-surface-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-surface-400" />
                  )}
                  <span className="text-sm font-medium text-surface-800">{team.name}</span>
                  <span className="rounded-full bg-surface-100 px-2 py-0.5 font-mono text-[11px] text-surface-500 dark:bg-surface-300 dark:text-surface-600">
                    {items.length}
                  </span>
                  {team.role === 'ADMIN' && (
                    <span className="ml-auto font-mono text-[10px] tracking-wide text-surface-400 uppercase">
                      admin
                    </span>
                  )}
                </button>

                {!collapsed && (
                  <div className="border-t border-surface-200 p-4 dark:border-surface-300">
                    {items.length === 0 ? (
                      <p className="text-sm text-surface-400">
                        No diagrams in this team yet.
                        {team.role === 'ADMIN'
                          ? ' Create one and pick this team as the owner.'
                          : ' Only team admins can create them.'}
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map(renderCard)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /** One diagram card. Shared by "My", each team's group, and "Shared with me". */
  function renderCard(entry: DiagramEntry) {
    return (
      <div
        key={entry.diagramId}
        className="group relative overflow-hidden rounded-lg border border-surface-200 bg-white transition-all hover:border-surface-300 hover:shadow-md dark:border-surface-300 dark:bg-surface-100 dark:hover:border-surface-400"
      >
        {/* Type color accent bar */}
        <div className="h-[3px]" style={{ backgroundColor: typeAccentColor(entry.diagramType) }} />
        <div className="flex items-start justify-between p-4">
          <button
            type="button"
            onClick={() => navigate(`/projects/${entry.projectId}/diagrams/${entry.diagramId}`)}
            className="min-w-0 flex-1 text-left"
            disabled={renamingId === entry.diagramId}
          >
            {renamingId === entry.diagramId ? (
              <input
                autoFocus
                defaultValue={entry.diagramName}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => commitRename(entry, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename(entry, e.currentTarget.value);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenamingId(null);
                  }
                }}
                className="w-full rounded border border-primary-500 bg-white px-1.5 py-0.5 font-medium text-surface-900 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-surface-100"
                aria-label="Diagram name"
              />
            ) : (
              <h3 className="truncate font-medium text-surface-800 transition-colors group-hover:text-primary-600">
                {entry.diagramName}
              </h3>
            )}
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
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </button>
          {/* Always visible (not hover-only: that hid them entirely on touch)
              and surface-400, which reads in both themes — surface-300 was
              invisible on the dark card. */}
          <div className="mt-0.5 ml-2 flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => setRenamingId(entry.diagramId)}
              className="rounded p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-primary-600"
              title="Rename"
              aria-label={`Rename ${entry.diagramName}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleDelete(entry)}
              className="rounded p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-red-500"
              title="Delete"
              aria-label={`Delete ${entry.diagramName}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSection(title: string, items: DiagramEntry[]) {
    if (items.length === 0) return null;
    return (
      <div className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <h2 className="text-xs font-semibold tracking-wider text-surface-400 uppercase">
            {title}
          </h2>
          <span className="rounded-full bg-surface-100 px-2 py-0.5 font-mono text-[11px] text-surface-500 dark:bg-surface-300 dark:text-surface-600">
            {items.length}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(renderCard)}</div>
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
                  Guest mode
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
        {loading && <p className="text-sm text-surface-400">Loading…</p>}

        {/* Empty state */}
        {isEmpty && !showForm && (
          <div className="flex flex-col items-center justify-center py-32">
            {/* The mark is a solid tile in its own right — sitting it inside a
                second tile at 40% opacity just made a pale blob. */}
            <img src="/favicon.svg" alt="" aria-hidden="true" className="mb-5 h-14 w-14" />
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

              {/* Owner. Only teams this user administers are offered — the server
                  refuses a team-owned project from anyone else, so offering one
                  would be an invitation to a 400. Hidden entirely when there's
                  nothing to choose between. */}
              {adminTeams.length > 0 && (
                <>
                  <Select
                    label="Owner"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                    options={[
                      { value: 'user', label: 'Personal' },
                      ...adminTeams.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                  />
                  <p className="text-xs text-surface-400">
                    {newOwner === 'user'
                      ? 'Only you can see this diagram, unless you share it.'
                      : 'Everyone on this team can open and edit it.'}
                  </p>
                </>
              )}

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
            {renderTeamSections()}
            {renderSection('Shared with Me', sharedEntries)}
          </>
        )}
      </main>
    </div>
  );
}
