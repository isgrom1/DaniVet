import { useState } from 'react';
import { Button } from '@/components/Button';
import { DateInput, DecimalInput, Field, Segmented, TextInput } from '@/components/form';
import { Sheet, toast } from '@/components/overlay';
import { insert } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { todayISO } from '@/lib/dates';
import { parseDecimal } from '@/lib/numbers';

export function WeightSheet({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(todayISO());
  const [source, setSource] = useState<'manual' | 'owner'>('manual');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const value = parseDecimal(kg);
  const error = kg && (value === null || value <= 0) ? 'Ingresa un peso válido en kg (ej.: 12,4)' : null;
  const save = async () => {
    if (value === null || value <= 0 || !date) return;
    setBusy(true);
    try {
      await insert('weights', { patientId, date, weightKg: value, source, notes: notes.trim() || undefined });
      toast.success('Peso registrado');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Registrar peso"
      footer={
        <Button block onClick={save} loading={busy} disabled={value === null || value <= 0 || !date}>
          Guardar peso
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Peso" required error={error}>
          <DecimalInput value={kg} onChange={setKg} unit="kg" placeholder="0,0" invalid={!!error} />
        </Field>
        <Field label="Fecha" required>
          <DateInput value={date} onChange={setDate} clearable={false} max={todayISO()} />
        </Field>
        <Field label="Origen del dato">
          <Segmented
            name="Origen del peso"
            value={source}
            onChange={setSource}
            options={[
              { value: 'manual', label: 'Pesado por mí' },
              { value: 'owner', label: 'Informado por el tutor' },
            ]}
          />
        </Field>
        <Field label="Nota (opcional)">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
