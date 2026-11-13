import { useState, useEffect, useCallback } from 'react';
import { getProjects, createProject, updateProject, deleteProject } from '../api/project.api.js';
import { useAuth } from '../hooks/useAuth.js';

const STATUS_COLORS = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  inactive: 'bg-muted text-muted-foreground',
  archived: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-muted-foreground hover:text-foreground">&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function ProjectForm({ initial = {}, onSubmit, loading }) {
  const [form, setForm] = useState({
    title: initial.title || '',
    description: initial.description || '',
    status: initial.status || 'active',
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Title *</label>
        <input
          name="title"
          value={form.title}
          onChange={handleChange}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Description</label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Status</label>
        <select
          name="status"
          value={form.status}
          onChange={handleChange}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <button
        onClick={() => onSubmit(form)}
        disabled={loading || !form.title.trim()}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {loading ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export default function Projects() {
  const { can, user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | 'create' | { edit: project } | { confirm: id }
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getProjects({ page, limit: 10, ...(statusFilter && { status: statusFilter }) });
      setProjects(data.data);
      setPagination(data.pagination);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (form) => {
    setSaving(true);
    try {
      await createProject(form);
      setModal(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (form) => {
    setSaving(true);
    try {
      await updateProject(modal.edit._id, form);
      setModal(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setSaving(true);
    try {
      await deleteProject(id);
      setModal(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const isOwner = (project) => project.createdBy?._id === user?.id || project.createdBy === user?.id;
  const canEdit = (project) => can('create_project') || isOwner(project);
  const canDelete = (project) => can('delete_project') && (user?.role !== 'manager' || isOwner(project));

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-5 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          {pagination.total !== undefined && (
            <p className="mt-0.5 text-sm text-muted-foreground">{pagination.total} total</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
          {can('create_project') && (
            <button
              onClick={() => setModal('create')}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + New project
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-b-primary" />
        </div>
      ) : projects.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <p className="text-lg">No projects yet</p>
          {can('create_project') && (
            <button onClick={() => setModal('create')} className="mt-3 text-sm text-primary hover:underline">
              Create your first project →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p._id} className="flex items-start justify-between gap-4 rounded-xl border bg-card px-5 py-4 text-card-foreground transition-colors hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="truncate font-medium">{p.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}>
                    {p.status}
                  </span>
                </div>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {p.createdBy?.name || 'Unknown'} · {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canEdit(p) && (
                  <button
                    onClick={() => setModal({ edit: p })}
                    className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    Edit
                  </button>
                )}
                {canDelete(p) && (
                  <button
                    onClick={() => setModal({ confirm: p._id })}
                    className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-muted-foreground">{page} / {pagination.pages}</span>
          <button
            disabled={page === pagination.pages}
            onClick={() => setPage(page + 1)}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {/* Create modal */}
      {modal === 'create' && (
        <Modal title="New project" onClose={() => setModal(null)}>
          <ProjectForm onSubmit={handleCreate} loading={saving} />
        </Modal>
      )}

      {/* Edit modal */}
      {modal?.edit && (
        <Modal title="Edit project" onClose={() => setModal(null)}>
          <ProjectForm initial={modal.edit} onSubmit={handleUpdate} loading={saving} />
        </Modal>
      )}

      {/* Delete confirm */}
      {modal?.confirm && (
        <Modal title="Delete project?" onClose={() => setModal(null)}>
          <p className="mb-5 text-sm text-muted-foreground">This will soft-delete the project. It can be recovered from the database.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setModal(null)}
              className="flex-1 rounded-md border py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDelete(modal.confirm)}
              disabled={saving}
              className="flex-1 rounded-md bg-destructive py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-60"
            >
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
