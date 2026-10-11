import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice } from '@/components/Card';
import { Switch, TextInput } from '@/components/form';
import { toast } from '@/components/overlay';
import { useSettings } from '@/data/hooks';
import { update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { newId } from '@/lib/ids';

export function PaymentMethodsSettings() {
  const s = useSettings();
  const [methods, setMethods] = useState(s.paymentMethods);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const clean = methods.filter((m) => m.name.trim()).map((m) => ({ ...m, name: m.name.trim() }));
    if (!clean.some((m) => m.active)) return toast.error('Debe haber al menos un medio de pago activo.');
    setBusy(true);
    try {
      await update('settings', 'settings', { paymentMethods: clean });
      toast.success('Medios de pago guardados');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Medios de pago" back="/mas" />
      <Page>
        <Notice tone="neutral">Solo se registra cómo te pagaron. La app no procesa pagos ni solicita datos bancarios.</Notice>
        <Card className="space-y-2">
          {methods.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3">
              <TextInput value={m.name} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Nombre del medio de pago" />
              <div className="w-24 shrink-0">
                <Switch checked={m.active} onChange={(v) => setMethods(methods.map((x, j) => (j === i ? { ...x, active: v } : x)))} label={<span className="sr-only">Activo</span>} />
              </div>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setMethods([...methods, { id: newId(), name: '', active: true }])}>
            Agregar medio de pago
          </Button>
        </Card>
      </Page>
      <StickyActions>
        <Button block onClick={save} loading={busy}>
          Guardar
        </Button>
      </StickyActions>
    </>
  );
}
