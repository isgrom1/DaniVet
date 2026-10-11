import { useState } from 'react';
import { Trash2, Wand2 } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice } from '@/components/Card';
import { confirmDialog, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { friendlyError } from '@/data/errors';
import { countDemo, loadDemoData, removeDemoData } from '@/features/demo/demoData';

export function DemoDataSettings() {
  useTables();
  const n = countDemo();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      await loadDemoData();
      toast.success('Datos de demostración cargados. Aparecen marcados como DEMO.');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    const ok = await confirmDialog({ title: 'Eliminar datos de demostración', message: `Se eliminarán ${n} registros marcados como DEMO. Tus registros reales no se modifican.`, confirmLabel: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    setBusy(true);
    try {
      const removed = await removeDemoData();
      toast.success(`${removed} registros de demostración eliminados`);
    } catch (e) {
      toast.error(`${friendlyError(e)} Si registraste datos reales en pacientes DEMO, muévelos o elimínalos primero.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Datos de demostración" back="/mas" />
      <Page>
        <Notice tone="info">
          Para conocer la app sin usar datos reales, puedes cargar tutores, pacientes, visitas, consultas, recetas y cobros de ejemplo. Todos aparecen con la etiqueta DEMO y se
          eliminan con un toque. No registres atenciones reales en pacientes de demostración.
        </Notice>
        <Card className="space-y-3">
          <p className="text-[15px]">{n ? `Hay ${n} registros de demostración cargados.` : 'No hay datos de demostración cargados.'}</p>
          {n ? (
            <Button block variant="secondary" className="text-red-700" icon={<Trash2 className="size-4" />} loading={busy} onClick={del}>
              Eliminar datos de demostración
            </Button>
          ) : (
            <Button block icon={<Wand2 className="size-4" />} loading={busy} onClick={load}>
              Cargar datos de demostración
            </Button>
          )}
        </Card>
      </Page>
    </>
  );
}
