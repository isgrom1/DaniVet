import type { ReactNode } from 'react';
import { PageHeader, Page } from '@/components/layout';
import { Card, Notice, Section } from '@/components/Card';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section title={title}>
      <Card className="space-y-2 text-[15px] leading-relaxed text-ink-700">{children}</Card>
    </Section>
  );
}

export function PrivacyInfo() {
  return (
    <>
      <PageHeader title="Privacidad y aspectos legales" back="/mas" />
      <Page>
        <Notice tone="warning" title="Información orientativa">
          Esta sección resume cómo funciona la app y normas chilenas relevantes revisadas en octubre de 2026. No constituye asesoría legal ni certifica cumplimiento normativo.
          Verifica tus obligaciones con un asesor o con tu colegio profesional.
        </Notice>
        <Block title="Dónde están los datos y quién accede">
          <p>Todos los datos (tutores, pacientes, fichas, archivos) se guardan solo en este dispositivo, cifrados con AES-256-GCM. La clave se deriva de tu contraseña y nunca sale del teléfono.</p>
          <p>La app no usa servidores propios, analítica, publicidad ni servicios en la nube: no envía datos a terceros. Solo tú, con tu contraseña o PIN, puedes leerlos.</p>
          <p>Los respaldos (.vetcasa) están cifrados. La exportación abierta y los PDF o CSV que generes no lo están: compártelos solo con quien corresponda.</p>
        </Block>
        <Block title="Protección de datos personales en Chile">
          <p>
            Hoy rige la Ley N.º 19.628 sobre protección de la vida privada. La Ley N.º 21.719, que la reemplaza en gran medida y crea la Agencia de Protección de Datos Personales, fue
            publicada el 13 de diciembre de 2024 y su entrada en vigencia está fijada para el 1 de diciembre de 2026. En septiembre de 2026 el Gobierno ingresó un proyecto (Boletín
            18.623-07) para postergarla un año; al revisar esta información aún estaba en tramitación.
          </p>
          <p>
            Como profesional que trata datos de tutores eres responsable de ese tratamiento: informa a los tutores para qué usas sus datos, recoge solo lo necesario, protégelos y
            atiende sus solicitudes de acceso, rectificación, supresión u oposición.
          </p>
          <p>Cómo hacerlo en la app: acceso (ficha del tutor o exportación en PDF), rectificación (editar), supresión (“Anonimizar datos personales” o eliminar si no hay registros asociados).</p>
        </Block>
        <Block title="Fichas clínicas y documentos">
          <p>Las consultas finalizadas no se sobrescriben: las correcciones quedan como enmiendas con motivo, y la versión anterior se conserva. Hay un historial cifrado de cambios.</p>
          <p>
            Recetas: el Decreto N.º 25 de 2005 del Ministerio de Agricultura (reglamento de productos farmacéuticos de uso exclusivamente veterinario) regula su emisión. Algunos
            productos exigen receta retenida en formato oficial (la Res. Ex. SAG N.º 667/2010 exige que sea manuscrita) y los antimicrobianos de uso veterinario deben recetarse en el
            Sistema de Prescripción Electrónica del SAG (Res. Ex. N.º 4116/2023 y sus modificaciones). El PDF de la app no reemplaza esos formatos.
          </p>
          <p>La firma insertada como imagen y el trazo en pantalla no son firma electrónica avanzada.</p>
          <p>Los comprobantes internos no son boletas ni facturas. Las boletas de honorarios se emiten en el sistema del SII.</p>
        </Block>
        <Block title="Microchip y registro de mascotas">
          <p>La Ley N.º 21.020 (tenencia responsable) establece la identificación y el registro de perros y gatos. La app guarda el número de microchip, pero no se conecta al Registro Nacional de Mascotas.</p>
        </Block>
        <Block title="Retención y eliminación">
          <p>Decide por cuánto tiempo conservas las fichas según tus obligaciones profesionales. “Eliminar todos los datos” borra la información de este dispositivo; los respaldos que hayas guardado fuera del teléfono deben eliminarse por separado.</p>
        </Block>
      </Page>
    </>
  );
}
