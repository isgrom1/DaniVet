import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ListTodo, Plus, Trash2 } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, Card, EmptyState, Notice } from '@/components/Card';
import { DateInput, Field, Segmented, Select, TextArea, TextInput } from '@/components/form';
import { PatientPickerSheet } from '@/components/pickers';
import { Sheet, confirmDialog, toast } from '@/components/overlay';
import { useProfile, useTables } from '@/data/hooks';
import { insert, remove, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { TASK_STATUS, TASK_TYPE } from '@/data/labels';
import type { Task } from '@/data/schema';
import { formatDate, relativeDays, todayISO } from '@/lib/dates';
import { nowISO } from '@/lib/ids';
import { cn } from '@/lib/cn';

export function TasksPage() {
  const tables = useTables();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  useEffect(() => {
    const id = params.get('id');
    if (id && tables.tasks.get(id)) setEditing(tables.tasks.get(id)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const list = useMemo(
    () =>
      [...tables.tasks.values()]
        .filter((t) => (filter === 'all' ? true : filter === 'open' ? t.status === 'pending' || t.status === 'in_progress' : t.status === 'done' || t.status === 'dismissed'))
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [tables, filter],
  );
  const today = todayISO();
  const toggleDone = async (t: Task) => {
    try {
      const done = t.status !== 'done';
      await update('tasks', t.id, { status: done ? 'done' : 'pending', completedAt: done ? nowISO() : undefined });
      toast.success(done ? 'Tarea completada' : 'Tarea reabierta');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <>
      <PageHeader
        title="Tareas de seguimiento"
        back="/mas"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nueva
          </Button>
        }
      />
      <Page>
        <Segmented
          name="Filtro"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: 'Pendientes' },
            { value: 'done', label: 'Cerradas' },
            { value: 'all', label: 'Todas' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState icon={<ListTodo className="size-6" />} title={filter === 'open' ? 'Sin tareas pendientes' : 'Sin tareas'}>
            Crea tareas para revisar resultados, llamar al tutor, agendar controles o completar documentos.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {list.map((t) => {
              const patient = t.patientId ? tables.patients.get(t.patientId) : undefined;
              const overdue = t.dueDate && t.dueDate < today && (t.status === 'pending' || t.status === 'in_progress');
              return (
                <Card key={t.id} padded={false} className="flex items-start gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => toggleDone(t)}
                    aria-label={t.status === 'done' ? 'Reabrir tarea' : 'Marcar como hecha'}
                    className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2', t.status === 'done' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-sand-400')}
                  >
                    {t.status === 'done' && <Check className="size-4" />}
                  </button>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                    <p className={cn('font-semibold', t.status === 'done' && 'text-ink-500 line-through')}>{t.title}</p>
                    <p className="text-sm text-ink-500">
                      {TASK_TYPE[t.type]}
                      {patient && ` · ${patient.name}`}
                      {t.assignee && ` · ${t.assignee}`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.dueDate && <Badge tone={overdue ? 'danger' : 'neutral'}>{formatDate(t.dueDate)} ({relativeDays(t.dueDate)})</Badge>}
                      {t.status === 'in_progress' && <Badge tone="info">En curso</Badge>}
                      {t.status === 'dismissed' && <Badge>Descartada</Badge>}
                    </div>
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </Page>
      {editing && (
        <TaskSheet
          task={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null);
            if (params.get('id')) setParams({}, { replace: true });
          }}
        />
      )}
    </>
  );
}

function TaskSheet({ task, onClose }: { task?: Task; onClose: () => void }) {
  const tables = useTables();
  const profile = useProfile();
  const [title, setTitle] = useState(task?.title ?? '');
  const [type, setType] = useState<Task['type']>(task?.type ?? 'contact_owner');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? todayISO());
  const [status, setStatus] = useState<Task['status']>(task?.status ?? 'pending');
  const [assignee, setAssignee] = useState(task?.assignee ?? profile?.fullName ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [patientId, setPatientId] = useState(task?.patientId ?? '');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const patient = patientId ? tables.patients.get(patientId) : undefined;
  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const data = {
      title: title.trim(),
      type,
      dueDate: dueDate || undefined,
      status,
      assignee: assignee.trim() || undefined,
      notes: notes.trim() || undefined,
      patientId: patientId || undefined,
      completedAt: status === 'done' ? (task?.completedAt ?? nowISO()) : undefined,
    };
    try {
      if (task) await update('tasks', task.id, (cur) => ({ ...cur, ...data }));
      else await insert('tasks', data);
      toast.success('Tarea guardada');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!task) return;
    if (!(await confirmDialog({ title: 'Eliminar tarea', confirmLabel: 'Eliminar', tone: 'danger' }))) return;
    try {
      await remove('tasks', task.id);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={task ? 'Editar tarea' : 'Nueva tarea'}
        footer={
          <div className="flex gap-2">
            {task && <Button variant="secondary" aria-label="Eliminar tarea" icon={<Trash2 className="size-4 text-red-700" />} onClick={del} />}
            <Button block onClick={save} loading={busy} disabled={!title.trim()}>
              Guardar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Tarea" required>
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as Task['type'])} aria-label="Tipo de tarea">
              {Object.entries(TASK_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha objetivo">
              <DateInput value={dueDate} onChange={setDueDate} />
            </Field>
            <Field label="Responsable">
              <TextInput value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            </Field>
          </div>
          <Field label="Estado">
            <Segmented name="Estado" size="sm" value={status} onChange={setStatus} options={Object.entries(TASK_STATUS).map(([k, v]) => ({ value: k as Task['status'], label: v }))} />
          </Field>
          <Field label="Paciente (opcional)">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPicker(true)}>
                {patient ? patient.name : 'Vincular paciente'}
              </Button>
              {patient && (
                <Link to={`/pacientes/${patient.id}`} className="text-sm font-semibold text-brand-700">
                  Ver ficha
                </Link>
              )}
            </div>
          </Field>
          {task?.consultationId && (
            <Notice tone="neutral">
              Vinculada a la{' '}
              <Link to={`/consultas/${task.consultationId}`} className="font-semibold underline">
                consulta
              </Link>
              .
            </Notice>
          )}
          <Field label="Notas">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} minRows={2} />
          </Field>
        </div>
      </Sheet>
      {picker && (
        <PatientPickerSheet
          onClose={() => setPicker(false)}
          onPick={(p) => {
            setPatientId(p.id);
            setPicker(false);
          }}
        />
      )}
    </>
  );
}
