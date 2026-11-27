import { useState, useEffect, useCallback } from 'react';
import { getProjects, createProject, updateProject, deleteProject } from '../api/project.api.js';
import { useAuth } from '../hooks/useAuth.js';
import { ProjectsDataTable } from '@/components/projects/projects-data-table.jsx';

const CATEGORIES = ['development', 'design', 'marketing', 'infrastructure', 'research'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const fieldClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const capitalize = (value) => value[0].toUpperCase() + value.slice(1);

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-muted-foreground hover:text-foreground">&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function ProjectForm({ initial = {}, onSubmit, loading }) {
  const [form, setForm] = useState({
    title: initial.title || '',
    description: initial.description || '',
    status: initial.status || 'active',
    code: initial.code || '',
    client: initial.client || '',
    category: initial.category || '',
    priority: initial.priority || 'medium',
    budget: initial.budget ?? '',
    spent: initial.spent ?? '',
    startDate: toDateInput(initial.startDate),
    dueDate: toDateInput(initial.dueDate),
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = () =>
    onSubmit({
      ...form,
      category: form.category || null,
      budget: form.budget === '' ? 0 : Number(form.budget),
      spent: form.spent === '' ? 0 : Number(form.spent),
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
    });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Title *" className="sm:col-span-2">
        <input name="title" value={form.title} onChange={handleChange} required className={fieldClass} />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          rows={3}
          className={`${fieldClass} resize-none`}
        />
      </Field>
      <Field label="Code">
        <input name="code" value={form.code} onChange={handleChange} placeholder="PRJ-2026-0001" className={fieldClass} />
      </Field>
      <Field label="Client">
        <input name="client" value={form.client} onChange={handleChange} className={fieldClass} />
      </Field>
      <Field label="Category">
        <select name="category" value={form.category} onChange={handleChange} className={fieldClass}>
          <option value="">None</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
        </select>
      </Field>
      <Field label="Priority">
        <select name="priority" value={form.priority} onChange={handleChange} className={fieldClass}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{capitalize(p)}</option>)}
        </select>
      </Field>
      <Field label="Budget">
        <input name="budget" type="number" min={0} value={form.budget} onChange={handleChange} className={fieldClass} />
      </Field>
      <Field label="Spent">
        <input name="spent" type="number" min={0} value={form.spent} onChange={handleChange} className={fieldClass} />
      </Field>
      <Field label="Start date">
        <input name="startDate" type="date" value={form.startDate} onChange={handleChange} className={fieldClass} />
      </Field>
      <Field label="Due date">
        <input name="dueDate" type="date" value={form.dueDate} onChange={handleChange} className={fieldClass} />
      </Field>
      <Field label="Status" className="sm:col-span-2">
        <select name="status" value={form.status} onChange={handleChange} className={fieldClass}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </Field>
      <button
        onClick={handleSubmit}
        disabled={loading || !form.title.trim()}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:col-span-2"
      >
        {loading ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export default function Projects() {
  const { can, user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | 'create' | { edit: project } | { confirm: id }
  const [saving, setSaving] = useState(false);

  // Client-side table: load every tenant project once, the table filters/sorts/pages locally
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getProjects({ limit: 1000 });
      setProjects(data.data);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const isOwner = useCallback(
    (project) => project.createdBy?._id === user?.id || project.createdBy === user?.id,
    [user],
  );
  const canEdit = useCallback((project) => can('create_project') || isOwner(project), [can, isOwner]);
  const canDelete = useCallback(
    (project) => can('delete_project') && (user?.role !== 'manager' || isOwner(project)),
    [can, isOwner, user],
  );
  const openEdit = useCallback((project) => setModal({ edit: project }), []);
  const openDelete = useCallback((project) => setModal({ confirm: project._id }), []);

  return (
    <div className="flex w-full min-w-0 flex-col p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        </div>
        {can('create_project') && (
          <button
            onClick={() => setModal('create')}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            + New project
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* Table (spinner only on first load so table state survives refreshes after CRUD) */}
      {loading && projects.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-b-primary" />
        </div>
      ) : (
        <ProjectsDataTable
          data={projects}
          onEdit={openEdit}
          onDelete={openDelete}
          canEdit={canEdit}
          canDelete={canDelete}
        />
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
