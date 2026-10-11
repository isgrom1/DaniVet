import {
  BookOpen,
  Boxes,
  CalendarCog,
  CircleHelp,
  CreditCard,
  DatabaseBackup,
  FileStack,
  FlaskConical,
  History,
  Info,
  LayoutDashboard,
  ListTodo,
  Lock,
  MessageSquarePlus,
  PawPrint,
  Pill,
  Receipt,
  Repeat,
  Scale,
  Search,
  ShieldCheck,
  Syringe,
  Tags,
  UserRound,
  UsersRound,
  Wand2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { List, ListRow, Section } from '@/components/Card';
import { useProfile } from '@/data/hooks';
import { lock } from '@/data/session';
import { flushAll } from '@/lib/flush';
import { APP_VERSION } from '@/lib/platform';
import { FeedbackSheet } from './FeedbackSheet';

const I = ({ children }: { children: ReactNode }) => <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{children}</span>;

export function MoreMenu() {
  const profile = useProfile();
  const [feedback, setFeedback] = useState(false);
  return (
    <>
      <PageHeader title="Más opciones" large subtitle={profile?.fullName} />
      <Page>
        <Section title="Clínica">
          <List>
            <ListRow to="/buscar" leading={<I><Search className="size-5" /></I>} title="Buscar" />
            <ListRow to="/tutores" leading={<I><UsersRound className="size-5" /></I>} title="Tutores" />
            <ListRow to="/preventivo" leading={<I><Syringe className="size-5" /></I>} title="Vacunas y desparasitaciones pendientes" />
            <ListRow to="/examenes" leading={<I><FlaskConical className="size-5" /></I>} title="Exámenes" />
            <ListRow to="/tareas" leading={<I><ListTodo className="size-5" /></I>} title="Tareas de seguimiento" />
            <ListRow to="/historial" leading={<I><History className="size-5" /></I>} title="Historial de cambios" />
          </List>
        </Section>
        <Section title="Gestión">
          <List>
            <ListRow to="/finanzas" leading={<I><Receipt className="size-5" /></I>} title="Cobros, gastos e ingresos" />
            <ListRow to="/inventario" leading={<I><Boxes className="size-5" /></I>} title="Inventario" />
          </List>
        </Section>
        <Section title="Configuración">
          <List>
            <ListRow to="/ajustes/perfil" leading={<I><UserRound className="size-5" /></I>} title="Perfil profesional" subtitle="Datos, logo y firma para documentos" />
            <ListRow to="/ajustes/servicios" leading={<I><Tags className="size-5" /></I>} title="Servicios y precios" />
            <ListRow to="/ajustes/agenda" leading={<I><CalendarCog className="size-5" /></I>} title="Agenda, traslados y recordatorios" />
            <ListRow to="/ajustes/especies" leading={<I><PawPrint className="size-5" /></I>} title="Especies y rangos de referencia" />
            <ListRow to="/ajustes/medicamentos" leading={<I><Pill className="size-5" /></I>} title="Medicamentos frecuentes" />
            <ListRow to="/ajustes/pautas" leading={<I><Repeat className="size-5" /></I>} title="Pautas de vacunación y desparasitación" />
            <ListRow to="/ajustes/plantillas" leading={<I><FileStack className="size-5" /></I>} title="Plantillas y textos frecuentes" />
            <ListRow to="/ajustes/pagos" leading={<I><CreditCard className="size-5" /></I>} title="Medios de pago" />
            <ListRow to="/ajustes/inicio" leading={<I><LayoutDashboard className="size-5" /></I>} title="Pantalla de inicio" />
          </List>
        </Section>
        <Section title="Seguridad y datos">
          <List>
            <ListRow to="/ajustes/seguridad" leading={<I><ShieldCheck className="size-5" /></I>} title="Seguridad" subtitle="Contraseña, PIN, bloqueo automático" />
            <ListRow to="/ajustes/respaldo" leading={<I><DatabaseBackup className="size-5" /></I>} title="Respaldo, exportación y restauración" />
            <ListRow to="/ajustes/demo" leading={<I><Wand2 className="size-5" /></I>} title="Datos de demostración" />
            <ListRow to="/ajustes/privacidad" leading={<I><Scale className="size-5" /></I>} title="Privacidad y aspectos legales" />
          </List>
        </Section>
        <Section title="Ayuda">
          <List>
            <ListRow to="/ayuda" leading={<I><BookOpen className="size-5" /></I>} title="Guía de uso e instalación en iPhone" />
            <ListRow onClick={() => setFeedback(true)} leading={<I><MessageSquarePlus className="size-5" /></I>} title="Sugerir un cambio o reportar un problema" subtitle="Se envía por WhatsApp o correo" />
            <ListRow to="/ajustes/acerca" leading={<I><Info className="size-5" /></I>} title="Acerca de la app" subtitle={`Versión ${APP_VERSION}`} />
          </List>
        </Section>
        <Button
          block
          variant="secondary"
          size="lg"
          icon={<Lock className="size-5" />}
          onClick={async () => {
            await flushAll();
            lock();
          }}
        >
          Bloquear ahora
        </Button>
        <p className="flex items-center justify-center gap-1 text-center text-xs text-ink-500">
          <CircleHelp className="size-3.5" /> Tus datos se guardan cifrados solo en este dispositivo.
        </p>
      </Page>
      {feedback && <FeedbackSheet onClose={() => setFeedback(false)} />}
    </>
  );
}
