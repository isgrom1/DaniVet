import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Card, KeyValue, Notice, Section } from '@/components/Card';
import { Button } from '@/components/Button';
import { toast } from '@/components/overlay';
import { applyUpdate, checkForUpdate } from '@/lib/sw';
import { useUiState } from '@/lib/uiState';
import { ReleaseNotes } from '@/features/more/WhatsNew';
import { useTables } from '@/data/hooks';
import { useDataStore } from '@/data/store';
import { estimateStorage } from '@/lib/idb';
import { APP_VERSION, BUILD_DATE, isStandalone } from '@/lib/platform';
import { formatDateTime } from '@/lib/dates';
import { formatBytes } from '@/features/attachments/attachments';

export function AboutPage() {
  const tables = useTables();
  const issues = useDataStore((s) => s.loadIssues);
  const [st, setSt] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  useEffect(() => {
    void estimateStorage().then(setSt);
  }, []);
  const updateReady = useUiState((s) => s.updateReady);
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    try {
      const r = await checkForUpdate();
      if (r === 'current') toast.success('Ya tienes la última versión.');
      else if (r === 'offline') toast.error('Sin conexión: no se pudo buscar. Inténtalo con Internet.');
      else if (r === 'unsupported') toast.info('Las actualizaciones automáticas funcionan en la app publicada.');
    } finally {
      setChecking(false);
    }
  };
  return (
    <>
      <PageHeader title="Acerca de" back="/mas" />
      <Page>
        <Card>
          <dl className="divide-y divide-sand-100">
            <KeyValue label="Versión" value={APP_VERSION} />
            <KeyValue label="Compilación" value={BUILD_DATE ? formatDateTime(BUILD_DATE) : 'desarrollo'} />
            <KeyValue label="Modo" value={isStandalone() ? 'App instalada (pantalla de inicio)' : 'Navegador'} />
            <KeyValue label="Almacenamiento" value={st.usage !== undefined ? `${formatBytes(st.usage)} usados` : 'Sin datos del navegador'} />
            <KeyValue label="Persistente" value={st.persisted ? 'Sí' : 'No confirmado'} />
            <KeyValue label="Pacientes / tutores" value={`${tables.patients.size} / ${tables.tutors.size}`} />
            <KeyValue label="Consultas" value={String(tables.consultations.size)} />
            <KeyValue label="Adjuntos" value={String(tables.attachments.size)} />
          </dl>
        </Card>
        <Section title="Actualizaciones">
          <Card className="space-y-3">
            <p className="text-[15px] text-ink-700">
              La app se actualiza sola: busca versiones nuevas al abrirla y al volver a ella, y las instala cuando está bloqueada, sin perder lo que estabas escribiendo.
            </p>
            {updateReady ? (
              <Button block icon={<RefreshCw className="size-4" />} onClick={() => void applyUpdate()}>
                Instalar la versión nueva ahora
              </Button>
            ) : (
              <Button block variant="secondary" icon={<RefreshCw className="size-4" />} loading={checking} onClick={() => void check()}>
                Buscar actualizaciones
              </Button>
            )}
          </Card>
        </Section>
        <Section title="Novedades por versión">
          <Card>
            <ReleaseNotes />
          </Card>
        </Section>
        {issues > 0 && <Notice tone="warning">Hay {issues} registro(s) que no pudieron validarse al abrir la app. Se conservan sin cambios; crea un respaldo y contacta a soporte técnico.</Notice>}
        <Section title="Tecnología">
          <Card className="space-y-2 text-sm text-ink-700">
            <p>Aplicación web progresiva (PWA) que funciona sin conexión. No es una app de App Store: se instala desde Safari en la pantalla de inicio.</p>
            <p>Cifrado: WebCrypto (PBKDF2-SHA256 con 600.000 iteraciones y AES-256-GCM). Almacenamiento: IndexedDB del dispositivo. PDF generados localmente con pdf-lib.</p>
            <p>Bibliotecas de código abierto: React, React Router, Zustand, Zod, idb, pdf-lib, fflate, Lucide, Tailwind CSS, Workbox.</p>
          </Card>
        </Section>
      </Page>
    </>
  );
}
