import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice } from '@/components/Card';
import { Switch } from '@/components/form';
import { toast } from '@/components/overlay';
import { useSettings } from '@/data/hooks';
import { update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { DASHBOARD_SECTIONS } from '@/data/defaults';

export function DashboardSettings() {
  const s = useSettings();
  const all = DASHBOARD_SECTIONS.map((x) => x.key as string);
  const [order, setOrder] = useState<string[]>([...s.dashboard.order.filter((k) => all.includes(k)), ...all.filter((k) => !s.dashboard.order.includes(k))]);
  const [hidden, setHidden] = useState<string[]>(s.dashboard.hidden);
  const [busy, setBusy] = useState(false);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const save = async () => {
    setBusy(true);
    try {
      await update('settings', 'settings', { dashboard: { order, hidden } });
      toast.success('Inicio personalizado');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Pantalla de inicio" back="/" />
      <Page>
        <Notice tone="neutral">Elige qué información ver primero. Las secciones sin contenido no se muestran.</Notice>
        <Card className="divide-y divide-sand-100" padded={false}>
          {order.map((k, i) => {
            const label = DASHBOARD_SECTIONS.find((x) => x.key === k)?.label ?? k;
            return (
              <div key={k} className="flex items-center gap-2 px-3 py-1">
                <div className="flex-1">
                  <Switch checked={!hidden.includes(k)} onChange={(v) => setHidden(v ? hidden.filter((x) => x !== k) : [...hidden, k])} label={label} />
                </div>
                <button type="button" aria-label={`Subir ${label}`} className="flex size-10 items-center justify-center rounded-full disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" aria-label={`Bajar ${label}`} className="flex size-10 items-center justify-center rounded-full disabled:opacity-30" disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </button>
              </div>
            );
          })}
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
