import { useId } from 'react';
import { Field, TextArea, TextInput } from './form';
import { RM_COMUNAS } from '@/data/places';

export interface AddressValue {
  label?: string;
  street: string;
  comuna?: string;
  city?: string;
  directions?: string;
}

export function AddressFields({
  value,
  onChange,
  showLabel = true,
  streetError,
  extraComunas = [],
}: {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  showLabel?: boolean;
  streetError?: string | null;
  extraComunas?: string[];
}) {
  const listId = useId();
  const comunas = [...new Set([...extraComunas, ...RM_COMUNAS])].sort((a, b) => a.localeCompare(b, 'es'));
  return (
    <div className="space-y-3">
      {showLabel && (
        <Field label="Nombre de la dirección" hint="Por ejemplo: Casa, Departamento, Casa de la abuela.">
          <TextInput value={value.label ?? ''} onChange={(e) => onChange({ ...value, label: e.target.value })} autoCapitalize="sentences" />
        </Field>
      )}
      <Field label="Calle y número" error={streetError}>
        <TextInput
          value={value.street}
          onChange={(e) => onChange({ ...value, street: e.target.value })}
          autoComplete="street-address"
          autoCapitalize="words"
          placeholder="Av. Ejemplo 1234, depto 56"
          invalid={!!streetError}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Comuna">
          <TextInput value={value.comuna ?? ''} onChange={(e) => onChange({ ...value, comuna: e.target.value })} list={listId} autoCapitalize="words" autoComplete="address-level3" />
          <datalist id={listId}>
            {comunas.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Ciudad">
          <TextInput value={value.city ?? ''} onChange={(e) => onChange({ ...value, city: e.target.value })} autoCapitalize="words" autoComplete="address-level2" />
        </Field>
      </div>
      <Field label="Indicaciones para llegar" hint="Portón, timbre, estacionamiento, perros sueltos, código de acceso…">
        <TextArea value={value.directions ?? ''} onChange={(e) => onChange({ ...value, directions: e.target.value })} minRows={2} />
      </Field>
    </div>
  );
}
