import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogOut, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { api } from '../services/api';
import { useAuth } from '../contexts/auth';

interface Team {
  id: string;
  name: string;
  slug: string;
}

interface TeamMember {
  id: string;
  role: string;
  user: { id: string; name?: string; email: string };
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function GuestTeamsPage() {
  return (
    <div className="min-h-screen bg-surface-50">
      <header className="border-b border-surface-200 bg-white dark:bg-surface-100 px-6">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="rounded-md p-1 text-surface-400 hover:bg-surface-50 hover:text-surface-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="h-4 w-px bg-surface-200" />
            <h1 className="text-base font-semibold tracking-tight text-surface-900">Teams</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-24 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-200">
          <Users className="h-7 w-7 text-surface-400" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-surface-800">Teams require an account</h2>
        <p className="mb-6 text-sm text-surface-400">
          Sign in to create and manage teams for collaborative diagram editing.
        </p>
        <Link
          to="/login"
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          Sign in
        </Link>
      </main>
    </div>
  );
}

export function TeamsPage() {
  const { user, isGuest } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isGuest) loadTeams();
  }, [isGuest]);
  useEffect(() => {
    if (selectedTeam) loadMembers(selectedTeam.id);
  }, [selectedTeam]);

  async function loadTeams() {
    try {
      const res = await api.teams.list();
      setTeams(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function loadMembers(teamId: string) {
    const res = await api.teams.get(teamId);
    setMembers(res.data.members);
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    const slug = toSlug(newTeamName.trim());
    try {
      const res = await api.teams.create({ name: newTeamName.trim(), slug });
      setTeams((prev) => [...prev, res.data]);
      setNewTeamName('');
      setSelectedTeam(res.data);
    } catch (err) {
      window.alert(`Failed to create team: ${err}`);
    }
  }

  async function handleInvite() {
    if (!selectedTeam || !inviteEmail.trim()) return;
    setInviteError('');
    try {
      const userRes = await api.users.search(inviteEmail.trim());
      await api.teams.addMember(selectedTeam.id, { userId: userRes.data.id, role: 'MEMBER' });
      setInviteEmail('');
      await loadMembers(selectedTeam.id);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'User not found');
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedTeam || !window.confirm('Remove this member?')) return;
    try {
      await api.teams.removeMember(selectedTeam.id, userId);
      await loadMembers(selectedTeam.id);
    } catch (err) {
      window.alert(`Failed to remove member: ${err instanceof Error ? err.message : err}`);
    }
  }

  function dropSelectedTeam() {
    setTeams((prev) => prev.filter((t) => t.id !== selectedTeam?.id));
    setSelectedTeam(null);
    setMembers([]);
  }

  async function handleDeleteTeam() {
    if (
      !selectedTeam ||
      !window.confirm(`Delete team "${selectedTeam.name}"? This cannot be undone.`)
    )
      return;
    try {
      await api.teams.delete(selectedTeam.id);
      dropSelectedTeam();
    } catch (err) {
      window.alert(`Failed to delete team: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function handleLeaveTeam() {
    if (!selectedTeam || !user || !window.confirm(`Leave team "${selectedTeam.name}"?`)) return;
    try {
      await api.teams.removeMember(selectedTeam.id, user.id);
      dropSelectedTeam();
    } catch (err) {
      window.alert(`Failed to leave team: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (isGuest) return <GuestTeamsPage />;

  const isAdmin = members.find((m) => m.user.id === user?.id)?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="border-b border-surface-200 bg-white dark:bg-surface-100 px-6">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="rounded-md p-1 text-surface-400 hover:bg-surface-50 hover:text-surface-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="h-4 w-px bg-surface-200" />
            <h1 className="text-base font-semibold tracking-tight text-surface-900">Teams</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: team list + create */}
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
                Your Teams
              </h2>
              {teams.length > 0 && (
                <span className="rounded-full bg-surface-100 dark:bg-surface-300 px-2 py-0.5 font-mono text-[11px] text-surface-500">
                  {teams.length}
                </span>
              )}
            </div>
            {loading ? (
              <p className="text-sm text-surface-400">Loading…</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeam(team)}
                    className={`rounded-lg border px-4 py-3 text-left transition-all ${
                      selectedTeam?.id === team.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-surface-200'
                        : 'border-surface-200 bg-white dark:bg-surface-100 hover:border-surface-300 dark:hover:border-surface-400 hover:shadow-sm'
                    }`}
                  >
                    <div className="text-sm font-medium text-surface-800">{team.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-surface-400">{team.slug}</div>
                  </button>
                ))}
                {teams.length === 0 && <p className="text-sm text-surface-400">No teams yet.</p>}
              </div>
            )}
            <div className="mt-4 rounded-lg border border-surface-200 dark:border-surface-300 bg-white dark:bg-surface-100 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-400">
                Create Team
              </h3>
              <div className="flex gap-2">
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Team name"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                />
                <Button
                  onClick={handleCreateTeam}
                  disabled={!newTeamName.trim()}
                  size="md"
                  aria-label="Create team"
                  title="Create team"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {newTeamName && (
                <p className="mt-1.5 font-mono text-[11px] text-surface-400">
                  slug: {toSlug(newTeamName)}
                </p>
              )}
            </div>
          </div>

          {/* Right: team details */}
          <div>
            {selectedTeam ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
                    {selectedTeam.name}
                  </h2>
                  {members.length > 0 &&
                    (isAdmin ? (
                      <button
                        onClick={handleDeleteTeam}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete team
                      </button>
                    ) : (
                      <button
                        onClick={handleLeaveTeam}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-300 transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Leave
                      </button>
                    ))}
                </div>
                <div className="rounded-lg border border-surface-200 dark:border-surface-300 bg-white dark:bg-surface-100 p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-400">
                    Members
                  </h3>
                  <div className="flex flex-col gap-2">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 dark:bg-surface-300 text-xs font-medium text-primary-700 dark:text-surface-700">
                            {(m.user.name ?? m.user.email).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-medium text-surface-800">
                              {m.user.name ?? m.user.email}
                            </span>
                            <span
                              className={`ml-2 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                                m.role === 'ADMIN'
                                  ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-600'
                                  : 'bg-surface-100 dark:bg-surface-300 text-surface-500 dark:text-surface-600'
                              }`}
                            >
                              {m.role}
                            </span>
                          </div>
                        </div>
                        {isAdmin && m.user.id !== user?.id && (
                          <button
                            onClick={() => handleRemoveMember(m.user.id)}
                            className="rounded p-1 text-surface-300 hover:bg-surface-100 hover:text-red-500 transition-colors"
                            title="Remove member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-surface-200 dark:border-surface-300 pt-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-400">
                      Invite by Email
                    </h3>
                    <div className="flex gap-2">
                      <Input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@example.com"
                        type="email"
                        onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                      />
                      <Button onClick={handleInvite} disabled={!inviteEmail.trim()}>
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                    {inviteError && <p className="mt-1.5 text-xs text-red-500">{inviteError}</p>}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[12rem] items-center justify-center rounded-lg border border-dashed border-surface-200 dark:border-surface-300 bg-white dark:bg-surface-100">
                <p className="text-sm text-surface-400">Select a team to view details</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
