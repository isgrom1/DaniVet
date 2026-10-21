import { PageHeader, Page } from '@/components/layout';
import { Card, Section } from '@/components/Card';
import { InstallGuide } from '@/features/auth/InstallGuide';

const QA: Array<[string, string]> = [
  ['¿Dónde se guardan mis datos?', 'Solo en este teléfono, cifrados con tu contraseña. La app no envía fichas ni datos a servidores (la única excepción es opcional: si activas la lectura de informes con IA, la foto o el PDF que elijas se envía a Anthropic para leerlo). Por eso es importante crear respaldos periódicos.'],
  ['¿Funciona sin señal?', 'Sí. Todo funciona sin conexión: consultas, agenda, recetas y PDF. Solo necesitas Internet para abrir mapas, WhatsApp, descargar actualizaciones de la app o leer informes con IA.'],
  ['¿Cómo inicio una consulta?', 'Desde la pestaña “Consulta”, desde una visita de la agenda (“Iniciar consulta”) o desde la ficha del paciente. La consulta se guarda sola mientras escribes (indicador “Guardado”).'],
  ['¿La app puede leer la foto o el PDF de un informe?', 'Sí, si activas la lectura con IA en Más › Lectura de informes con IA (es opcional y usa tu propia clave de Claude, de Anthropic). En el examen toca “Leer foto o PDF con IA”: la IA transcribe los valores y tú los revisas antes de agregarlos. Sin IA, puedes copiar el texto del informe y pegarlo en “Dictar o pegar”.'],
  ['¿Puedo cambiar una consulta finalizada?', 'Sí, con “Corregir / enmendar”. Debes indicar el motivo; la versión anterior queda guardada y visible en “Trazabilidad”.'],
  ['¿Cómo comparto una receta?', 'Abre la receta emitida y toca “Ver / compartir PDF”. Luego “Compartir” abre las opciones del iPhone (WhatsApp, Mail, Guardar en Archivos, Imprimir).'],
  ['¿La app me avisa de vacunas o controles?', 'Muestra en Inicio las vacunas, desparasitaciones y controles según las fechas que registraste. No envía notificaciones al teléfono. Puedes agregar una visita al Calendario del iPhone para recibir su alerta.'],
  ['¿Qué pasa si pierdo o cambio el teléfono?', 'Restaura tu último respaldo en el nuevo teléfono (“Restaurar desde un respaldo”) con tu contraseña o tu clave de recuperación. Sin respaldo, los datos no se pueden recuperar.'],
  ['¿Qué hago si olvido la contraseña?', 'En la pantalla de desbloqueo toca “Olvidé mi contraseña” e ingresa tu clave de recuperación.'],
  ['¿Los comprobantes sirven como boleta?', 'No. Son comprobantes internos. Las boletas de honorarios se emiten en el sistema del SII.'],
];

export function HelpPage() {
  return (
    <>
      <PageHeader title="Guía de uso" back="/mas" />
      <Page>
        <InstallGuide />
        <Section title="Primeros pasos">
          <Card>
            <ol className="list-decimal space-y-1.5 pl-5 text-[15px] text-ink-700">
              <li>Completa tu perfil profesional y, si quieres, sube tu logo y una imagen de tu firma.</li>
              <li>Define tus servicios y precios.</li>
              <li>Registra un tutor y sus mascotas (puedes asociar varias a un mismo tutor).</li>
              <li>Agenda la visita y, el día de la atención, inicia la consulta desde la cita.</li>
              <li>Al terminar: finaliza la consulta, emite la receta y registra el cobro.</li>
              <li>Cada semana: crea un respaldo y guárdalo en iCloud Drive o en tu correo.</li>
            </ol>
          </Card>
        </Section>
        <Section title="Preguntas frecuentes">
          <div className="space-y-2">
            {QA.map(([q, a]) => (
              <details key={q} className="card p-4">
                <summary className="cursor-pointer text-[15px] font-semibold text-ink-900">{q}</summary>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{a}</p>
              </details>
            ))}
          </div>
        </Section>
      </Page>
    </>
  );
}
