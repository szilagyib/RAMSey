async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (res.status === 401) {
    if (!url.includes('/api/auth/')) {
      window.dispatchEvent(new CustomEvent('ramsey:unauthorized'));
    }
    // Surface the server's message (e.g. "Invalid email or password") instead
    // of a bare "Unauthorized" — it's what login/register screens display.
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }

  return res.json();
}

async function requestBinary(url: string, options: RequestInit = {}): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }

  return res.arrayBuffer();
}

export const api = {
  auth: {
    register: (data: { email: string; password: string; name?: string }) =>
      request<{ data: { id: string; email: string; name?: string } }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      request<{ data: { id: string; email: string; name?: string } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    logout: () =>
      request<{ data: { ok: boolean } }>('/api/auth/logout', { method: 'POST', body: '{}' }),
    me: () =>
      request<{ data: { id: string; email: string; name?: string; image?: string; emailVerified?: string | null; createdAt: string } }>('/api/auth/me'),
    forgotPassword: (email: string) =>
      request<{ data: { ok: boolean } }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      request<{ data: { ok: boolean } }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }),
    verifyEmail: (token: string) =>
      request<{ data: { ok: boolean } }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    resendVerification: () =>
      request<{ data: { ok: boolean } }>('/api/auth/resend-verification', {
        method: 'POST',
        body: '{}',
      }),
    exportData: () =>
      request<{ data: Record<string, unknown> }>('/api/auth/export'),
    deleteAccount: () =>
      // body '{}': the shared request() helper always sets a JSON content-type,
      // and Fastify rejects an empty body when that header is present.
      request<{ data: { ok: boolean } }>('/api/auth/me', { method: 'DELETE', body: '{}' }),
  },

  notifications: {
    list: () =>
      request<{
        data: {
          items: Array<{
            id: string;
            type: string;
            payload: Record<string, unknown>;
            read: boolean;
            createdAt: string;
          }>;
          unread: number;
        };
      }>('/api/notifications'),
    readAll: () =>
      request<{ data: { ok: boolean } }>('/api/notifications/read-all', {
        method: 'POST',
        body: '{}',
      }),
  },

  users: {
    search: (email: string) =>
      request<{ data: { id: string; name?: string; email: string } }>(`/api/users/search?email=${encodeURIComponent(email)}`),
  },

  projects: {
    list: () =>
      request<{ data: Array<{ id: string; name: string; description?: string; ownerType: string; ownerId: string; createdAt: string; updatedAt: string }> }>(
        '/api/projects',
      ),

    get: (id: string) =>
      request<{ data: { id: string; name: string; description?: string; createdAt: string; updatedAt: string } }>(
        `/api/projects/${id}`,
      ),

    create: (data: { name: string; description?: string; ownerType?: 'user' | 'team'; ownerId?: string }) =>
      request<{ data: { id: string; name: string; description?: string } }>(
        '/api/projects',
        {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            ownerType: data.ownerType ?? 'user',
            ownerId: data.ownerId,
          }),
        },
      ),

    delete: (id: string) =>
      request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  },

  teams: {
    list: () =>
      request<{ data: Array<{ id: string; name: string; slug: string }> }>(
        '/api/teams',
      ),
    create: (data: { name: string; slug: string }) =>
      request<{ data: { id: string; name: string; slug: string } }>(
        '/api/teams',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    get: (teamId: string) =>
      request<{ data: { id: string; name: string; slug: string; members: Array<{ id: string; role: string; user: { id: string; name?: string; email: string } }> } }>(
        `/api/teams/${teamId}`,
      ),
    addMember: (teamId: string, data: { userId: string; role?: 'ADMIN' | 'MEMBER' }) =>
      request<{ data: { id: string; teamId: string; userId: string; role: string } }>(
        `/api/teams/${teamId}/members`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    removeMember: (teamId: string, userId: string) =>
      request<void>(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
    delete: (teamId: string) =>
      request<void>(`/api/teams/${teamId}`, { method: 'DELETE' }),
  },

  shares: {
    listProjectShares: (projectId: string) =>
      request<{ data: Array<{ id: string; userId: string; role: string }> }>(
        `/api/projects/${projectId}/shares`,
      ),
    createProjectShare: (projectId: string, data: { userId: string; role?: 'EDITOR' | 'VIEWER' }) =>
      request<{ data: { id: string; userId: string; role: string } }>(
        `/api/projects/${projectId}/shares`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    deleteProjectShare: (projectId: string, shareId: string) =>
      request<void>(`/api/projects/${projectId}/shares/${shareId}`, { method: 'DELETE' }),
    listShareLinks: (projectId: string) =>
      request<{ data: Array<{ id: string; token: string; role: string; expiresAt?: string; isActive: boolean }> }>(
        `/api/projects/${projectId}/share-links`,
      ),
    createShareLink: (projectId: string, data: { role?: 'EDITOR' | 'VIEWER'; expiresAt?: string }) =>
      request<{ data: { id: string; token: string; role: string; expiresAt?: string; isActive: boolean } }>(
        `/api/projects/${projectId}/share-links`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    revokeShareLink: (projectId: string, linkId: string) =>
      request<void>(`/api/projects/${projectId}/share-links/${linkId}`, { method: 'DELETE' }),
    redeemShareLink: (token: string) =>
      request<{ data: { id: string; projectId: string; role: string } }>(
        `/api/share-links/${token}/redeem`,
        { method: 'POST' },
      ),
  },

  diagrams: {
    list: (projectId: string) =>
      request<{ data: Array<{ id: string; name: string; type: string; content?: unknown; createdAt: string; updatedAt: string }> }>(
        `/api/projects/${projectId}/diagrams`,
      ),

    get: (projectId: string, diagramId: string) =>
      request<{ data: { id: string; name: string; type: string; content?: unknown; project?: { id: string; name: string }; createdAt: string; updatedAt: string } }>(
        `/api/projects/${projectId}/diagrams/${diagramId}`,
      ),

    create: (projectId: string, data: { name: string; type: string }) =>
      request<{ data: { id: string; name: string; type: string } }>(
        `/api/projects/${projectId}/diagrams`,
        { method: 'POST', body: JSON.stringify(data) },
      ),

    update: (projectId: string, diagramId: string, data: { name?: string; content?: unknown }) =>
      request<{ data: { id: string; name: string; type: string; content?: unknown } }>(
        `/api/projects/${projectId}/diagrams/${diagramId}`,
        { method: 'PATCH', body: JSON.stringify(data) },
      ),

    delete: (projectId: string, diagramId: string) =>
      request<void>(`/api/projects/${projectId}/diagrams/${diagramId}`, { method: 'DELETE' }),

    getState: (projectId: string, diagramId: string) =>
      requestBinary(`/api/projects/${projectId}/diagrams/${diagramId}/state`),

    saveState: (projectId: string, diagramId: string, state: ArrayBuffer) =>
      request<void>(
        `/api/projects/${projectId}/diagrams/${diagramId}/state`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: state,
        },
      ),

    listSnapshots: (projectId: string, diagramId: string) =>
      request<{ data: Array<{ id: string; label?: string; createdAt: string }> }>(
        `/api/projects/${projectId}/diagrams/${diagramId}/snapshots`,
      ),

    createSnapshot: (projectId: string, diagramId: string, data?: { label?: string }) =>
      request<{ data: { id: string; label?: string; createdAt: string } }>(
        `/api/projects/${projectId}/diagrams/${diagramId}/snapshots`,
        { method: 'POST', body: JSON.stringify(data ?? {}) },
      ),
  },

  analysis: {
    create: (
      projectId: string,
      diagramId: string,
      data: { modelIR: unknown; method: string; options?: Record<string, unknown> },
    ) =>
      request<{ data: { jobId: string; status: string } }>(
        `/api/projects/${projectId}/diagrams/${diagramId}/analysis`,
        { method: 'POST', body: JSON.stringify(data) },
      ),

    get: (projectId: string, diagramId: string, jobId: string) =>
      request<{
        data: { jobId: string; status: string; progress: number; errorMessage: string | null; result: unknown };
      }>(`/api/projects/${projectId}/diagrams/${diagramId}/analysis/${jobId}`),
  },
};
