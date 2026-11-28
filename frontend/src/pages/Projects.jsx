import { useCallback, useEffect, useState } from 'react';
import { Archive, CircleCheck, CircleSlash, FolderPlus, LoaderCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getProjects, createProject, updateProject, deleteProject } from '../api/project.api.js';
import { errorMessage } from '@/api/admin.api';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader, fieldClass } from '@/components/admin/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectsDataTable } from '@/components/projects/projects-data-table.jsx';
import { projectAccess } from '@/components/projects/access.js';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import { cn } from '@/lib/utils';

const CATEGORIES = ['development', 'design', 'marketing', 'infrastructure', 'research'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = [
  { value: 'active', label: 'Active', icon: CircleCheck },
  { value: 'inactive', label: 'Inactive', icon: CircleSlash },
  { value: 'archived', label: 'Archived', icon: Archive },
];

const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const capitalize = (value) => value[0].toUpperCase() + value.slice(1);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Client-side table: load every tenant project, one page of 1000 at a time, then filter locally. */
const fetchAllProjects = () =>
  fetchAllPages(async (page) => {
    const { data } = await getProjects({ page, limit: 1000 });
    return { items: data.data, pages: data.pagination?.pages };
  });

function Field({ id, label, error, className, children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function emptyForm(initial = {}) {
  return {
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
  };
}

function ProjectDialog({ open, project, onClose, onSaved }) {
  const editing = Boolean(project);
  const [values, setValues] = useState(emptyForm());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setValues(emptyForm(project || {}));
  }, [open, project]);

  const set = (event) => setValues((v) => ({ ...v, [event.target.name]: event.target.value }));
  const invalid = (key) => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': `project-${key}-error` } : {});

  const submit = async (event) => {
    event.preventDefault();
    const found = {};
    if (!values.title.trim()) found.title = 'Enter a project title.';
    if (values.budget !== '' && Number(values.budget) < 0) found.budget = 'Budget can’t be negative.';
    if (values.spent !== '' && Number(values.spent) < 0) found.spent = 'Spent can’t be negative.';
    if (values.startDate && values.dueDate && values.dueDate < values.startDate) found.dueDate = 'Due date must be on or after the start date.';
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = {
      ...values,
      title: values.title.trim(),
      category: values.category || null,
      budget: values.budget === '' ? 0 : Number(values.budget),
      spent: values.spent === '' ? 0 : Number(values.spent),
      startDate: values.startDate || null,
      dueDate: values.dueDate || null,
    };
    setSaving(true);
    try {
      if (editing) await updateProject(project._id, payload);
      else await createProject(payload);
      toast.success(editing ? `${payload.title} was updated` : `${payload.title} was created`);
      onSaved();
      onClose();
    } catch (err) {
      setErrors({ form: errorMessage(err, editing ? 'Couldn’t save the project.' : 'Couldn’t create the project.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${project.title}` : 'New project'}</DialogTitle>
          <DialogDescription>Fields marked * are required.</DialogDescription>
        </DialogHeader>
        <form id="project-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="project-title" label="Title *" error={errors.title} className="sm:col-span-2">
            <input id="project-title" name="title" className={fieldClass} value={values.title} maxLength={120} autoFocus onChange={set} {...invalid('title')} />
          </Field>
          <Field id="project-description" label="Description" className="sm:col-span-2">
            <textarea id="project-description" name="description" rows={3} className={cn(fieldClass, 'h-auto resize-none py-1.5')} value={values.description} onChange={set} />
          </Field>
          <Field id="project-code" label="Code">
            <input id="project-code" name="code" className={fieldClass} placeholder="PRJ-2026-0001" value={values.code} onChange={set} />
          </Field>
          <Field id="project-client" label="Client">
            <input id="project-client" name="client" className={fieldClass} value={values.client} onChange={set} />
          </Field>
          <Field id="project-category" label="Category">
            <select id="project-category" name="category" className={fieldClass} value={values.category} onChange={set}>
              <option value="">None</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {capitalize(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="project-priority" label="Priority">
            <select id="project-priority" name="priority" className={fieldClass} value={values.priority} onChange={set}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {capitalize(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="project-budget" label="Budget" error={errors.budget}>
            <input id="project-budget" name="budget" type="number" min={0} className={fieldClass} value={values.budget} onChange={set} {...invalid('budget')} />
          </Field>
          <Field id="project-spent" label="Spent" error={errors.spent}>
            <input id="project-spent" name="spent" type="number" min={0} className={fieldClass} value={values.spent} onChange={set} {...invalid('spent')} />
          </Field>
          <Field id="project-startDate" label="Start date">
            <input id="project-startDate" name="startDate" type="date" className={fieldClass} value={values.startDate} onChange={set} />
          </Field>
          <Field id="project-dueDate" label="Due date" error={errors.dueDate}>
            <input id="project-dueDate" name="dueDate" type="date" className={fieldClass} value={values.dueDate} onChange={set} {...invalid('dueDate')} />
          </Field>
          <Field id="project-status" label="Status" className="sm:col-span-2">
            <select id="project-status" name="status" className={fieldClass} value={values.status} onChange={set}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          {errors.form && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {errors.form}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
            {editing ? 'Save changes' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Projects() {
  const { can, user } = useAuth();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null); // { project? } — null closed, {} create
  const [confirmDelete, setConfirmDelete] = useState(null); // { projects, clear? }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllProjects()
      .then((items) => {
        if (cancelled) return;
        setProjects(items);
        setError(null);
      })
      .catch((err) => !cancelled && setError(errorMessage(err, 'Couldn’t load projects.')));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const canEdit = useCallback((project) => projectAccess(project, user, can).canEdit, [can, user]);
  const canDelete = useCallback((project) => projectAccess(project, user, can).canDelete, [can, user]);
  const openEdit = useCallback((project) => setDialog({ project }), []);
  const openDelete = useCallback((project) => setConfirmDelete({ projects: [project] }), []);

  /** One request per project; toasts a summary, then reloads. */
  const runBulk = async (targets, request, verb, clear) => {
    setBusy(true);
    const results = await Promise.allSettled(targets.map(request));
    setBusy(false);
    const failed = results.filter((r) => r.status === 'rejected');
    const ok = results.length - failed.length;
    if (ok) toast.success(`${plural(ok, 'project')} ${verb}`);
    if (failed.length) toast.error(`${plural(failed.length, 'project')} could not be ${verb}: ${errorMessage(failed[0].reason)}`);
    clear?.();
    reload();
  };

  const bulkActions = (selected, clear) => {
    const editable = selected.filter(canEdit);
    const deletable = selected.filter(canDelete);
    const skipped = selected.length - editable.length;
    return (
      <>
        {STATUSES.map((status) => {
          const targets = editable.filter((p) => p.status !== status.value);
          return (
            <Button
              key={status.value}
              variant="outline"
              size="sm"
              disabled={busy || !targets.length}
              onClick={() => runBulk(targets, (p) => updateProject(p._id, { status: status.value }), `set to ${status.label.toLowerCase()}`, clear)}
            >
              <status.icon className="size-4" />
              {status.label} ({targets.length})
            </Button>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          disabled={busy || !deletable.length}
          onClick={() => setConfirmDelete({ projects: deletable, clear })}
        >
          <Trash2 className="size-4" />
          Delete ({deletable.length})
        </Button>
        {skipped > 0 && (
          <span className="text-xs text-muted-foreground">
            {plural(skipped, 'selected project')} you can’t edit will be skipped.
          </span>
        )}
      </>
    );
  };

  const deleting = confirmDelete?.projects || [];

  return (
    <div className="flex w-full min-w-0 flex-col p-4">
      <PageHeader title="Projects" description="Track every project’s budget, status and deadlines.">
        {can('create_project') && (
          <Button onClick={() => setDialog({})}>
            <FolderPlus data-icon="inline-start" />
            New project
          </Button>
        )}
      </PageHeader>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Skeleton only on first load so table state survives refreshes after edits */}
      {!projects && !error ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-14 w-full rounded-lg" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        projects && (
          <ProjectsDataTable
            data={projects}
            onEdit={openEdit}
            onDelete={openDelete}
            canEdit={canEdit}
            canDelete={canDelete}
            bulkActions={bulkActions}
          />
        )
      )}

      <ProjectDialog open={Boolean(dialog)} project={dialog?.project} onClose={() => setDialog(null)} onSaved={reload} />

      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && !busy && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deleting.length === 1 ? `Delete ${deleting[0].title}?` : `Delete ${plural(deleting.length, 'project')}?`}</DialogTitle>
            <DialogDescription>
              Deleted projects leave every list and report. An administrator can still recover them from the database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              autoFocus
              disabled={busy}
              onClick={async () => {
                await runBulk(deleting, (p) => deleteProject(p._id), 'deleted', confirmDelete.clear);
                setConfirmDelete(null);
              }}
            >
              {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
