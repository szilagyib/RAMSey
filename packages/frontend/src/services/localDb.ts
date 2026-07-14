const STORAGE_KEY = 'ramsey_local_db';

export interface LocalProject {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerType: 'user';
  createdAt: string;
  updatedAt: string;
}

export interface LocalDiagram {
  id: string;
  projectId: string;
  name: string;
  type: string;
  content?: unknown;
  createdAt: string;
  updatedAt: string;
}

interface LocalDb {
  projects: Record<string, LocalProject>;
  diagrams: Record<string, LocalDiagram>;
}

function loadDb(): LocalDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LocalDb;
  } catch {
    // corrupted storage — start fresh
  }
  return { projects: {}, diagrams: {} };
}

function saveDb(db: LocalDb): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function newId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function diagramKey(projectId: string, diagramId: string): string {
  return `${projectId}/${diagramId}`;
}

export const localDb = {
  projects: {
    list: async (): Promise<{ data: LocalProject[] }> => {
      const db = loadDb();
      return { data: Object.values(db.projects) };
    },

    get: async (id: string): Promise<{ data: LocalProject }> => {
      const db = loadDb();
      const project = db.projects[id];
      if (!project) throw new Error(`Project not found: ${id}`);
      return { data: project };
    },

    create: async (data: {
      name: string;
      description?: string;
      ownerId?: string;
      ownerType?: string;
    }): Promise<{ data: { id: string; name: string; description?: string } }> => {
      const db = loadDb();
      const id = newId();
      const ts = now();
      const project: LocalProject = {
        id,
        name: data.name,
        description: data.description,
        ownerId: data.ownerId ?? 'local',
        ownerType: 'user',
        createdAt: ts,
        updatedAt: ts,
      };
      db.projects[id] = project;
      saveDb(db);
      return { data: { id, name: project.name, description: project.description } };
    },

    delete: async (id: string): Promise<void> => {
      const db = loadDb();
      delete db.projects[id];
      // Cascade delete diagrams in this project
      for (const key of Object.keys(db.diagrams)) {
        if (db.diagrams[key].projectId === id) {
          delete db.diagrams[key];
        }
      }
      saveDb(db);
    },
  },

  diagrams: {
    list: async (projectId: string): Promise<{ data: LocalDiagram[] }> => {
      const db = loadDb();
      const diagrams = Object.values(db.diagrams).filter((d) => d.projectId === projectId);
      return { data: diagrams };
    },

    get: async (
      projectId: string,
      diagramId: string,
    ): Promise<{ data: LocalDiagram & { project?: { id: string; name: string } } }> => {
      const db = loadDb();
      const diagram = db.diagrams[diagramKey(projectId, diagramId)];
      if (!diagram) throw new Error(`Diagram not found: ${diagramId}`);
      const project = db.projects[projectId];
      return {
        data: {
          ...diagram,
          project: project ? { id: project.id, name: project.name } : undefined,
        },
      };
    },

    create: async (
      projectId: string,
      data: { name: string; type: string },
    ): Promise<{ data: { id: string; name: string; type: string } }> => {
      const db = loadDb();
      const id = newId();
      const ts = now();
      const diagram: LocalDiagram = {
        id,
        projectId,
        name: data.name,
        type: data.type,
        content: null,
        createdAt: ts,
        updatedAt: ts,
      };
      db.diagrams[diagramKey(projectId, id)] = diagram;
      saveDb(db);
      return { data: { id, name: diagram.name, type: diagram.type } };
    },

    update: async (
      projectId: string,
      diagramId: string,
      data: { name?: string; content?: unknown },
    ): Promise<{ data: LocalDiagram }> => {
      const db = loadDb();
      const key = diagramKey(projectId, diagramId);
      const diagram = db.diagrams[key];
      if (!diagram) throw new Error(`Diagram not found: ${diagramId}`);
      if (data.name !== undefined) diagram.name = data.name;
      if (data.content !== undefined) diagram.content = data.content;
      diagram.updatedAt = now();
      db.diagrams[key] = diagram;
      saveDb(db);
      return { data: diagram };
    },

    delete: async (projectId: string, diagramId: string): Promise<void> => {
      const db = loadDb();
      delete db.diagrams[diagramKey(projectId, diagramId)];
      saveDb(db);
    },

    createSnapshot: async (
      _projectId: string,
      _diagramId: string,
      _data?: { label?: string },
    ): Promise<{ data: { id: string; createdAt: string } }> => {
      // No-op for local mode — snapshots are not supported without a backend
      return { data: { id: newId(), createdAt: now() } };
    },
  },
};
