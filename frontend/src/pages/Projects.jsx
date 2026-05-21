import { useState, useEffect, useCallback } from 'react';
import { getProjects, createProject, updateProject, deleteProject } from '../api/project.api.js';
import { useAuth } from '../hooks/useAuth.js';

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  archived: 'bg-amber-100 text-amber-700',
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
        <input
          name="title"
          value={form.title}
          onChange={handleChange}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <select
          name="status"
          value={form.status}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <button
        onClick={() => onSubmit(form)}
        disabled={loading || !form.title.trim()}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          {pagination.total !== undefined && (
            <p className="text-sm text-gray-500 mt-0.5">{pagination.total} total</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
          {can('create_project') && (
            <button
              onClick={() => setModal('create')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + New project
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No projects yet</p>
          {can('create_project') && (
            <button onClick={() => setModal('create')} className="mt-3 text-sm text-indigo-600 hover:underline">
              Create your first project →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p._id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-start justify-between gap-4 hover:border-gray-300 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-gray-900 truncate">{p.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}>
                    {p.status}
                  </span>
                </div>
                {p.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  {p.createdBy?.name || 'Unknown'} · {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canEdit(p) && (
                  <button
                    onClick={() => setModal({ edit: p })}
                    className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-300 transition-colors"
                  >
                    Edit
                  </button>
                )}
                {canDelete(p) && (
                  <button
                    onClick={() => setModal({ confirm: p._id })}
                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:border-red-300 transition-colors"
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
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-gray-300"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500">{page} / {pagination.pages}</span>
          <button
            disabled={page === pagination.pages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-gray-300"
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
          <p className="text-sm text-gray-600 mb-5">This will soft-delete the project. It can be recovered from the database.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setModal(null)}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2 rounded-lg hover:border-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDelete(modal.confirm)}
              disabled={saving}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg"
            >
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
