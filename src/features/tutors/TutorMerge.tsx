import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GitMerge } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { confirmDialog, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { batch } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import type { Tutor } from '@/data/schema';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/cn';
import { patientsOfTutor } from '@/features/patients/selectors';

const FIELDS: Array<{ key: keyof Tutor; label: string; fmt?: (v: unknown) => string }> = [
  { key: 'fullName', label: 'Nombre' },
  { key: 'phone', label: 'Teléfono', fmt: (v) => formatPhone(v as string) },
  { key: 'phoneAlt', label: 'Teléfono alternativo', fmt: (v) => formatPhone(v as string) },
  { key: 'email', label: 'Correo' },
  { key: 'rut', label: 'RUT' },
  { key: 'notes', label: 'Observaciones' },
];

/** a = registro que se conserva; b = registro que se fusiona en a. */
export function TutorMerge() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const a = tables.tutors.get(params.get('a') ?? '');
  const b = tables.tutors.get(params.get('b') ?? '');
  const [choice, setChoice] = useState<Record<string, 'a' | 'b'>>({});
  const [busy, setBusy] = useState(false);

  const moves = useMemo(() => {
    if (!b) return null;
    const id = b.id;
    return {
      patients: patientsOfTutor(tables, id),
      appointments: [...tables.appointments.values()].filter((x) => x.tutorId === id),
      consultations: [...tables.consultations.values()].filter((x) => x.tutorId === id),
      prescriptions: [...tables.prescriptions.values()].filter((x) => x.tutorId === id),
      charges: [...tables.charges.values()].filter((x) => x.tutorId === id),
      payments: [...tables.payments.values()].filter((x) => x.tutorId === id),
      budgets: [...tables.budgets.values()].filter((x) => x.tutorId === id),
      documents: [...tables.documents.values()].filter((x) => x.tutorId === id),
      reminders: [...tables.reminders.values()].filter((x) => x.tutorId === id),
    };
  }, [tables, b]);

  if (!a || !b || a.id === b.id || !moves) {
    return (
      <>
        <PageHeader title="Fusionar tutores" back="/tutores" />
        <Page>
          <Notice tone="warning">Selecciona dos tutores distintos para fusionar.</Notice>
        </Page>
      </>
    );
  }

  const pick = (k: string) => choice[k] ?? (a[k as keyof Tutor] ? 'a' : b[k as keyof Tutor] ? 'b' : 'a');

  const merge = async () => {
    const summary = `${moves.patients.length} mascota(s), ${moves.appointments.length} cita(s), ${moves.consultations.length} consulta(s), ${moves.charges.length} cobro(s) y ${moves.payments.length} pago(s)`;
    const ok = await confirmDialog({
      title: 'Confirmar fusión',
      message: (
        <>
          <p>
            Se trasladarán al registro de <strong>{a.fullName}</strong>: {summary}.
          </p>
          <p>El registro duplicado quedará marcado como fusionado (no se elimina, para conservar la trazabilidad).</p>
        </>
      ),
      confirmLabel: 'Fusionar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const tx = batch();
      const merged: Partial<Tutor> = {};
      for (const f of FIELDS) {
        const src = pick(f.key) === 'a' ? a : b;
        (merged as Record<string, unknown>)[f.key] = src[f.key];
      }
      const addresses = [...a.addresses, ...b.addresses.filter((x) => !a.addresses.some((y) => y.street.trim().toLowerCase() === x.street.trim().toLowerCase()))].map((x, i) => ({
        ...x,
        primary: i === 0 ? true : false,
      }));
      if (a.addresses.some((x) => x.primary)) {
        const primaryId = a.addresses.find((x) => x.primary)!.id;
        for (const x of addresses) x.primary = x.id === primaryId;
      }
      tx.update('tutors', a.id, (cur) => ({
        ...cur,
        ...merged,
        addresses,
        altContact: cur.altContact ?? b.altContact,
        decisionMaker: cur.decisionMaker ?? b.decisionMaker,
        contactPreference: cur.contactPreference ?? b.contactPreference,
      }));
      for (const p of moves.patients) {
        tx.update('patients', p.id, (cur) => {
          const roleB = cur.tutors.find((x) => x.tutorId === b.id)?.role ?? 'secondary';
          const others = cur.tutors.filter((x) => x.tutorId !== b.id && x.tutorId !== a.id);
          const existingA = cur.tutors.find((x) => x.tutorId === a.id);
          const role = existingA?.role === 'primary' || roleB === 'primary' ? 'primary' : 'secondary';
          const list = [{ tutorId: a.id, role }, ...others];
          if (!list.some((x) => x.role === 'primary')) list[0].role = 'primary';
          return { ...cur, tutors: list as typeof cur.tutors };
        });
      }
      for (const x of moves.appointments) tx.update('appointments', x.id, { tutorId: a.id });
      for (const x of moves.consultations) tx.update('consultations', x.id, { tutorId: a.id }, { amend: x.status === 'final', reason: 'Fusión de tutores duplicados' });
      for (const x of moves.prescriptions) {
        if (x.status === 'draft') tx.update('prescriptions', x.id, { tutorId: a.id });
      }
      for (const x of moves.charges) if (!x.voided) tx.update('charges', x.id, { tutorId: a.id });
      for (const x of moves.payments) if (!x.voided) tx.update('payments', x.id, { tutorId: a.id });
      for (const x of moves.budgets) tx.update('budgets', x.id, { tutorId: a.id });
      for (const x of moves.documents) if (x.status === 'draft') tx.update('documents', x.id, { tutorId: a.id });
      for (const x of moves.reminders) tx.update('reminders', x.id, { tutorId: a.id });
      tx.update('tutors', b.id, { mergedIntoId: a.id }, { action: 'merge', summary: `Fusionado en ${a.fullName}` });
      tx.log({ entity: 'tutors', entityId: a.id, action: 'merge', summary: `Recibió los datos de un registro duplicado: ${summary}` });
      await tx.commit();
      toast.success('Tutores fusionados');
      navigate(`/tutores/${a.id}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Fusionar tutores" back={`/tutores/${b.id}`} />
      <Page>
        <Notice tone="info" icon={<GitMerge className="size-5" />}>
          Revisa cada dato y elige cuál conservar. Las recetas y documentos ya emitidos mantienen los datos con que fueron emitidos.
        </Notice>
        <div className="grid grid-cols-2 gap-2 text-center text-sm font-semibold text-ink-600">
          <div className="rounded-xl bg-brand-50 p-2 text-brand-800">Se conserva</div>
          <div className="rounded-xl bg-sand-200 p-2">Duplicado</div>
        </div>
        <Section title="Datos a conservar">
          {FIELDS.map((f) => {
            const va = a[f.key] as string | undefined;
            const vb = b[f.key] as string | undefined;
            if (!va && !vb) return null;
            const fmt = (v?: string) => (v ? (f.fmt ? f.fmt(v) : v) : '—');
            return (
              <Card key={f.key} padded={false} className="p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{f.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['a', 'b'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setChoice((c) => ({ ...c, [f.key]: side }))}
                      className={cn(
                        'min-h-11 rounded-xl border p-2 text-left text-sm break-words',
                        pick(f.key) === side ? 'border-brand-600 bg-brand-50 font-semibold text-brand-900' : 'border-sand-300 bg-white text-ink-700',
                      )}
                      aria-pressed={pick(f.key) === side}
                    >
                      {fmt(side === 'a' ? va : vb)}
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
        </Section>
        <Section title="Se trasladarán">
          <Card>
            <ul className="space-y-1 text-[15px] text-ink-700">
              <li>Mascotas: {moves.patients.map((p) => p.name).join(', ') || 'ninguna'}</li>
              <li>Direcciones del duplicado que no estén repetidas: {b.addresses.length}</li>
              <li>Citas: {moves.appointments.length} · Consultas: {moves.consultations.length}</li>
              <li>Cobros: {moves.charges.length} · Pagos: {moves.payments.length} · Presupuestos: {moves.budgets.length}</li>
            </ul>
          </Card>
        </Section>
      </Page>
      <StickyActions>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
        <Button block onClick={merge} loading={busy} icon={<GitMerge className="size-4" />}>
          Fusionar
        </Button>
      </StickyActions>
    </>
  );
}
