import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/overlay';
import { CHANGELOG, releasesSince, type Release } from '@/changelog';
import { getMeta, setMeta } from '@/lib/idb';
import { APP_VERSION, DEFAULT_APP_NAME } from '@/lib/platform';
import { formatDate } from '@/lib/dates';

const LAST_SEEN = 'lastSeenVersion';

/** Muestra una vez las novedades de las versiones instaladas desde la última vez que se abrió la app. */
export function WhatsNew() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const seen = await getMeta<string>(LAST_SEEN);
      if (!alive) return;
      // Cuenta nueva o recién restaurada en este equipo: no hay novedades que mostrar.
      if (!seen) {
        await setMeta(LAST_SEEN, APP_VERSION);
        return;
      }
      const list = releasesSince(seen, APP_VERSION);
      // Se registra antes de mostrarlas: si la app se cierra enseguida, no vuelven a aparecer.
      if (seen !== APP_VERSION) await setMeta(LAST_SEEN, APP_VERSION);
      if (alive && list.length) setReleases(list);
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!releases) return null;
  const close = () => setReleases(null);
  return (
    <Sheet
      open
      onClose={close}
      title={`${DEFAULT_APP_NAME} se actualizó`}
      footer={
        <Button block size="lg" onClick={close}>
          Entendido
        </Button>
      }
    >
      <ReleaseNotes releases={releases} />
    </Sheet>
  );
}

export function ReleaseNotes({ releases = CHANGELOG }: { releases?: Release[] }) {
  return (
    <div className="space-y-4">
      {releases.map((r) => (
        <section key={r.version}>
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-900">
            <Sparkles className="size-4 text-brand-700" aria-hidden /> Versión {r.version} · {formatDate(r.date)}
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[15px] text-ink-700">
            {r.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
