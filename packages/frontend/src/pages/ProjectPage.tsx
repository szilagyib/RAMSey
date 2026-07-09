import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { getAllDiagramTypes } from '../diagram-types/registry';
import { toBackendType } from '../lib/diagramTypeMapping';
import { getDataService } from '../services/dataService';
import { useAuth } from '../contexts/auth';

interface Diagram {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
}

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const ds = getDataService(user?.id);
  const [project, setProject] = useState<Project | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('markov_chain');

  const diagramTypes = getAllDiagramTypes();

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [projectRes, diagramsRes] = await Promise.all([
        ds.projects.get(projectId),
        ds.diagrams.list(projectId),
      ]);
      setProject(projectRes.data);
      setDiagrams(diagramsRes.data);
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, [projectId, ds]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount; state updates happen after await, not synchronously
    loadData();
  }, [loadData]);

  async function handleCreate() {
    if (!newName.trim() || !projectId) return;
    try {
      await ds.diagrams.create(projectId, {
        name: newName.trim(),
        type: toBackendType(newType),
      });
      setNewName('');
      setShowForm(false);
      await loadData();
    } catch (err) {
      window.alert(`Failed to create diagram: ${err}`);
    }
  }

  async function handleDelete(diagramId: string) {
    if (!projectId || !window.confirm('Delete this diagram?')) return;
    try {
      await ds.diagrams.delete(projectId, diagramId);
      await loadData();
    } catch (err) {
      window.alert(`Failed to delete diagram: ${err}`);
    }
  }

  const typeLabel = (backendType: string): string => {
    const found = diagramTypes.find((dt) => toBackendType(dt.id) === backendType);
    return found?.name ?? backendType;
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="border-b border-surface-200 bg-white dark:bg-surface-100 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-surface-400 hover:text-surface-600">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-xs text-surface-400">
                <Link to="/" className="hover:underline">Dashboard</Link>
                <span>/</span>
                <span>{project?.name ?? 'Project'}</span>
              </div>
              <h1 className="text-lg font-bold text-surface-800">{project?.name ?? 'Loading...'}</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-800">Diagrams</h2>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            New Diagram
          </Button>
        </div>

        {showForm && (
          <div className="mb-6 rounded-lg border border-surface-200 bg-white dark:bg-surface-100 p-4">
            <div className="flex flex-col gap-3">
              <Input
                label="Diagram Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Main System Markov Model"
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
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={!newName.trim()}>
                  Create Diagram
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <p className="text-sm text-surface-400">Loading diagrams...</p>
        )}

        {!loading && diagrams.length === 0 && (
          <div className="rounded-lg border border-dashed border-surface-300 bg-white dark:bg-surface-100 p-12 text-center">
            <p className="text-surface-500">No diagrams yet. Create one to get started.</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {diagrams.map((diagram) => (
            <div
              key={diagram.id}
              className="rounded-lg border border-surface-200 bg-white dark:bg-surface-100 p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <Link
                  to={`/projects/${projectId}/diagrams/${diagram.id}`}
                  className="flex-1"
                >
                  <h3 className="font-semibold text-surface-800">{diagram.name}</h3>
                  <span className="mt-1 inline-block rounded-full bg-primary-100 dark:bg-surface-300 px-2 py-0.5 text-xs font-medium text-primary-700 dark:text-surface-700">
                    {typeLabel(diagram.type)}
                  </span>
                  <p className="mt-2 text-xs text-surface-400">
                    Updated {new Date(diagram.updatedAt).toLocaleDateString()}
                  </p>
                </Link>
                <button
                  onClick={() => handleDelete(diagram.id)}
                  className="ml-2 rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
