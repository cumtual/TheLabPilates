import type { Metadata } from 'next';
import { LegalShell, LegalSection } from '@/components/legal/LegalShell';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad',
  description:
    'Aviso de Privacidad de The Lab Pilates Studio conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).',
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Aviso de Privacidad"
      subtitle="Emitido en cumplimiento de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento."
      lastUpdated="12 de septiembre de 2026"
    >
      <LegalSection title="1. Identidad y domicilio del responsable">
        <p>
          <strong className="text-soft-charcoal">The Lab Pilates Studio</strong> (en lo
          sucesivo, &ldquo;el Estudio&rdquo;), con domicilio en Matamoros &amp; Calle
          Prolongación de Micaela Galindo, Centro, 69000 Heroica Cdad. de Huajuapan de
          León, Oaxaca, México, es responsable del tratamiento de sus datos personales.
        </p>
        <p>
          Giro: estudio de entrenamiento funcional y pilates, reserva de clases
          presenciales y control de cupos.
        </p>
        <p>
          Canal oficial de privacidad:{' '}
          <a
            className="text-primary underline underline-offset-2 hover:text-secondary"
            href="mailto:contacto@thelabpilatesstudio.com.mx"
          >
            contacto@thelabpilatesstudio.com.mx
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Datos personales que recabamos">
        <p>Para las finalidades descritas en este aviso, podemos recabar las siguientes categorías de datos:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-soft-charcoal">Identificación y contacto:</strong> nombre
            completo, correo electrónico y número de teléfono.
          </li>
          <li>
            <strong className="text-soft-charcoal">Cuenta y credenciales:</strong> usuario y
            contraseña cifrada necesarios para acceder a la plataforma de reservas.
          </li>
          <li>
            <strong className="text-soft-charcoal">Transacciones y pagos:</strong> referencias
            de transferencias SPEI, confirmaciones de pago en efectivo o registros de
            pasarelas de pago. <em>No almacenamos números completos de tarjeta, códigos CVV
            ni otros datos financieros sensibles.</em>
          </li>
          <li>
            <strong className="text-soft-charcoal">Aptitud física básica:</strong> la
            manifestación de que usted se encuentra en condiciones de realizar actividad
            física, así como el registro de asistencias a clase.
          </li>
          <li>
            <strong className="text-soft-charcoal">Datos de terceros (invitados):</strong> el
            nombre del invitado que usted proporciona voluntariamente al reservar una clase
            con acompañante. Usted declara contar con el consentimiento de dicha persona para
            compartir sus datos.
          </li>
        </ul>
        <p>
          No recabamos datos personales sensibles en términos del artículo 3, fracción VI de
          la LFPDPPP. Le solicitamos no proporcionar información médica detallada; basta con
          la manifestación de aptitud para el ejercicio.
        </p>
      </LegalSection>

      <LegalSection title="3. Finalidades del tratamiento">
        <p>
          <strong className="text-soft-charcoal">Finalidades primarias</strong> (necesarias
          para la relación contractual):
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Creación y administración de su cuenta de usuario.</li>
          <li>Gestión de membresías y paquetes de créditos.</li>
          <li>Reserva de clases presenciales y control de aforo/cupos.</li>
          <li>Procesamiento, registro y confirmación de pagos.</li>
          <li>Atención de solicitudes y ejercicio de derechos.</li>
        </ul>
        <p>
          <strong className="text-soft-charcoal">Finalidades secundarias</strong> (no
          necesarias para la relación contractual, pero que mejoran el servicio):
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Avisos de cancelación de clases por parte del Estudio.</li>
          <li>Cambios de horario, recordatorios y confirmaciones de servicio.</li>
        </ul>
        <p>
          Si usted no desea que sus datos sean tratados para las finalidades secundarias,
          puede manifestarlo enviando un correo a nuestro canal oficial de privacidad. La
          negativa no será motivo para negarle los servicios contratados.
        </p>
      </LegalSection>

      <LegalSection title="4. Transferencias de datos">
        <p>
          Sus datos no serán transferidos a terceros sin su consentimiento, salvo las
          excepciones previstas en el artículo 37 de la LFPDPPP (por ejemplo, requerimientos
          de autoridad competente o proveedores de servicios que resulten indispensables). En
          su caso, dichos proveedores estarán obligados a mantener la confidencialidad y a
          tratar los datos conforme a este aviso.
        </p>
      </LegalSection>

      <LegalSection title="5. Derechos ARCO">
        <p>
          Usted tiene derecho a <strong className="text-soft-charcoal">Acceder</strong> a sus
          datos personales, <strong className="text-soft-charcoal">Rectificarlos</strong>{' '}
          cuando sean inexactos, <strong className="text-soft-charcoal">Cancelarlos</strong>{' '}
          cuando proceda y <strong className="text-soft-charcoal">Oponerse</strong> a su
          tratamiento. Para ejercerlos, envíe una solicitud a{' '}
          <a
            className="text-primary underline underline-offset-2 hover:text-secondary"
            href="mailto:contacto@thelabpilatesstudio.com.mx"
          >
            contacto@thelabpilatesstudio.com.mx
          </a>{' '}
          indicando:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Nombre completo y medio para recibir notificaciones.</li>
          <li>Documento que acredite su identidad (o de su representante legal).</li>
          <li>Descripción clara de los datos sobre los que desea ejercer el derecho.</li>
        </ul>
        <p>
          Daremos respuesta en un plazo máximo de <strong className="text-soft-charcoal">20
          días hábiles</strong> contados a partir de la recepción de la solicitud, conforme al
          artículo 29 de la LFPDPPP, sin perjuicio de cualquier prórroga legalmente aplicable.
        </p>
      </LegalSection>

      <LegalSection title="6. Cookies y almacenamiento local">
        <p>
          Utilizamos cookies y mecanismos de almacenamiento local estrictamente necesarios para
          mantener su sesión de usuario y el proceso de autenticación (token de sesión). No
          utilizamos cookies con fines publicitarios ni de perfilado. Puede configurar su
          navegador para bloquear o eliminar estas tecnologías, aunque ello puede impedir el
          funcionamiento de la plataforma de reservas.
        </p>
      </LegalSection>

      <LegalSection title="7. Medidas de seguridad">
        <p>
          Implementamos medidas administrativas, técnicas y físicas razonables para proteger
          sus datos personales contra daño, pérdida, alteración, destrucción o uso no
          autorizado, incluyendo el cifrado de contraseñas y controles de acceso por rol.
        </p>
      </LegalSection>

      <LegalSection title="8. Cambios a este aviso">
        <p>
          Nos reservamos el derecho de actualizar este Aviso de Privacidad en cualquier
          momento. Cualquier modificación será publicada en esta misma página, indicando la
          fecha de última actualización. Le recomendamos revisarlo periódicamente.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
