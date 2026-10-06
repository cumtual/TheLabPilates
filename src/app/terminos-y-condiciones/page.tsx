import type { Metadata } from 'next';
import { LegalShell, LegalSection } from '@/components/legal/LegalShell';
import { GRACE_PERIOD_MINUTES } from '@/lib/utils/date';

export const metadata: Metadata = {
  title: 'Términos y Condiciones',
  description:
    'Términos y Condiciones de uso de The Lab Pilates Studio: membresías, créditos, reservas, cancelaciones y reglas del estudio.',
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Términos y Condiciones de Uso"
      subtitle="Contrato de adhesión aplicable al uso de la plataforma de reservas, las instalaciones y los servicios de The Lab Pilates Studio."
      lastUpdated="24 de septiembre de 2026"
    >
      <LegalSection title="1. Aceptación y capacidad legal">
        <p>
          Al registrarse, adquirir una membresía o reservar una clase, usted acepta en su
          totalidad los presentes Términos y Condiciones. El consentimiento se otorga de forma
          digital y expresa mediante las acciones de registro y reserva, en términos del
          artículo 1803 del Código Civil Federal y del artículo 89 del Código de Comercio.
        </p>
        <p>
          Para contratar los servicios usted debe ser mayor de edad y contar con capacidad
          legal para obligarse. Los menores de edad únicamente podrán acceder con autorización
          y presencia de su padre, madre o tutor.
        </p>
      </LegalSection>

      <LegalSection title="2. Cuenta de usuario">
        <p>
          Usted es responsable de la veracidad de los datos proporcionados y de mantener la
          confidencialidad de sus credenciales. Toda actividad realizada desde su cuenta se
          presumirá realizada por usted. Notifique de inmediato cualquier uso no autorizado a{' '}
          <a
            className="text-primary underline underline-offset-2 hover:text-secondary"
            href="mailto:contacto@thelabpilatesstudio.com.mx"
          >
            contacto@thelabpilatesstudio.com.mx
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="3. Membresías y paquetes de créditos">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-soft-charcoal">Open Lab:</strong> acceso ilimitado a
            clases durante 30 días naturales. Incluye 1 crédito de invitado por mes. Al
            término del periodo, la membresía expira automáticamente y no se renueva sin una
            nueva compra.
          </li>
          <li>
            <strong className="text-soft-charcoal">Paquetes por créditos (Lab Progress, Lab
            Practice, Lab Entry, Lab Pass):</strong> otorgan un número determinado de
            créditos, no acumulables entre periodos, con una vigencia de 1 mes natural. Al
            agotarse los créditos o al vencer el plazo, el paquete pasa a estado{' '}
            <em>expirado</em> y los créditos remanentes no son reembolsables ni transferibles.
          </li>
          <li>
            <strong className="text-soft-charcoal">Suscripciones suspendidas:</strong> el
            administrador del Estudio podrá suspender una suscripción de forma discrecional
            (por ejemplo, por incumplimiento de estos términos). Si usted adquiere un nuevo
            plan teniendo una suscripción suspendida, la anterior pasará a estado{' '}
            <em>expirado</em> y perderá los créditos remanentes.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Precios y pagos">
        <p>
          Los precios se muestran en pesos mexicanos (MXN) y pueden actualizarse en cualquier
          momento. Los pagos se realizan por transferencia bancaria (SPEI) o en efectivo en el
          estudio, y quedan sujetos a confirmación del administrador para activar la
          membresía. Las reservas no podrán realizarse mientras exista un pago pendiente de
          confirmación.
        </p>
      </LegalSection>

      <LegalSection title="5. Política de cancelaciones y reembolso de créditos">
        <p>
          <strong className="text-soft-charcoal">5.1 Definiciones.</strong> Para efectos de
          esta cláusula: (a) <em>«Reserva»</em> es el lugar que usted aparta en una clase a
          través de la plataforma; (b) <em>«Crédito»</em> es cada sesión incluida en el paquete
          o membresía contratada, que se descuenta al realizar una Reserva; (c){' '}
          <em>«Hora de la Reserva»</em> es la fecha y hora en que la plataforma registra la
          Reserva; y (d) <em>«Hora de Inicio»</em> es la fecha y hora programada para el
          comienzo de la clase. Todos los horarios se rigen por la hora oficial de la Ciudad de
          México (zona horaria America/Mexico_City), conforme al registro electrónico de la
          plataforma.
        </p>
        <p>
          <strong className="text-soft-charcoal">5.2 Cancelación con anticipación.</strong>{' '}
          Usted puede cancelar su Reserva desde la plataforma. Si la cancelación se realiza con
          al menos{' '}
          <strong className="text-soft-charcoal">veinticuatro (24) horas de anticipación</strong>{' '}
          a la Hora de Inicio, el Crédito se reintegra en su totalidad a la suscripción con la
          que se hizo la Reserva, sin cargo ni penalización alguna.
        </p>
        <p>
          <strong className="text-soft-charcoal">
            5.3 Periodo de tolerancia por error ({GRACE_PERIOD_MINUTES} minutos).
          </strong>{' '}
          Con independencia de la anticipación con que se cancele, si usted cancela su Reserva
          dentro de los{' '}
          <strong className="text-soft-charcoal">diez ({GRACE_PERIOD_MINUTES}) minutos</strong>{' '}
          naturales siguientes a la Hora de la Reserva, minuto diez incluido, el Crédito se
          reintegra en su totalidad, aun cuando falten menos de veinticuatro (24) horas para la
          Hora de Inicio. Este periodo sirve para corregir reservas hechas por error y aplica
          siempre que la clase no haya iniciado.
        </p>
        <p>
          <strong className="text-soft-charcoal">5.4 Cancelación tardía.</strong> Transcurrido
          el periodo de tolerancia del numeral 5.3, la cancelación que se realice con menos de
          veinticuatro (24) horas de anticipación a la Hora de Inicio se considera{' '}
          <strong className="text-soft-charcoal">cancelación tardía</strong> y no da derecho a
          la reposición del Crédito, ya que el lugar permaneció reservado a su nombre y no pudo
          ofrecerse a otras personas. Antes de confirmar una cancelación tardía, la plataforma
          le informará que el Crédito no será reintegrado y requerirá su confirmación expresa.
        </p>
        <p>
          <strong className="text-soft-charcoal">5.5 Clases iniciadas e inasistencia.</strong>{' '}
          No es posible cancelar una Reserva después de la Hora de Inicio. La inasistencia sin
          cancelación previa (<em>no-show</em>) implica la pérdida del Crédito, sin derecho a
          reembolso.
        </p>
        <p>
          <strong className="text-soft-charcoal">5.6 Invitados.</strong> Las reglas de los
          numerales 5.2 a 5.5 aplican también a los lugares reservados para invitados y al
          crédito de invitado correspondiente; el periodo de tolerancia se cuenta a partir de la
          hora en que se registró al invitado.
        </p>
        <p>
          <strong className="text-soft-charcoal">5.7 Cancelación por parte del Estudio.</strong>{' '}
          Si el Estudio cancela una clase por causa de fuerza mayor o decisión administrativa,
          los Créditos de todas las Reservas afectadas, y en su caso el crédito de invitado, se
          reintegran en su totalidad sin que usted deba solicitarlo.
        </p>
        <p>
          <strong className="text-soft-charcoal">5.8 Cupo y registro.</strong> El control de
          cupos es estricto; una reserva no confirmada previamente no garantiza lugar en clase.
          La plataforma conserva la fecha y hora de cada Reserva y de cada cancelación, que
          sirven para aplicar esta política; usted puede solicitar su aclaración a través de los
          medios de contacto del Estudio.
        </p>
        <p>
          <strong className="text-soft-charcoal">5.9 Derechos del consumidor.</strong> Nada de
          lo previsto en esta cláusula limita ni restringe los derechos que la Ley Federal de
          Protección al Consumidor le otorga; usted puede acudir a la Procuraduría Federal del
          Consumidor (PROFECO) para cualquier queja o reclamación.
        </p>
      </LegalSection>

      <LegalSection title="6. Puntualidad y acceso a clases">
        <p>
          Por seguridad y para evitar interrupciones o lesiones por falta de calentamiento,
          existe un tiempo máximo de tolerancia de acceso a cada clase. Una vez transcurrido
          dicho margen, no se permitirá el acceso y la reserva se considerará como no-show,
          perdiendo el crédito correspondiente.
        </p>
      </LegalSection>

      <LegalSection title="7. Uso responsable y código de conducta">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            Cuide las instalaciones y el material de entrenamiento; el uso negligente podrá
            generar responsabilidad por los daños ocasionados.
          </li>
          <li>
            Mantenga un trato respetuoso. Existe cero tolerancia a la discriminación, el acoso
            o cualquier conducta que altere la seguridad y la sana convivencia en el Estudio.
          </li>
          <li>
            El Estudio se reserva el derecho de suspender o cancelar cuentas ante faltas graves
            o reiteradas a estas reglas, sin que ello genere reembolso.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Aptitud física y deslinde de responsabilidad">
        <p>
          Usted declara estar en condiciones físicas óptimas para realizar actividad deportiva,
          incluyendo entrenamiento funcional, mat pilates y barre. Asimismo, libera al Estudio
          de responsabilidad por lesiones derivadas de padecimientos o preexistencias médicas
          no declaradas, o de la ejecución negligente de los ejercicios.
        </p>
        <p>
          Si padece alguna condición médica, lesión o se encuentra embarazada, deberá
          consultarlo previamente con un profesional de la salud y notificarlo al instructor
          antes de la clase.
        </p>
      </LegalSection>

      <LegalSection title="9. Propiedad intelectual">
        <p>
          La marca, logotipos, contenidos, rutinas y materiales del Estudio son de su
          propiedad o se utilizan con autorización. Queda prohibida su reproducción o uso sin
          consentimiento previo por escrito.
        </p>
      </LegalSection>

      <LegalSection title="10. Modificaciones">
        <p>
          El Estudio podrá actualizar estos Términos y Condiciones en cualquier momento. Las
          modificaciones entrarán en vigor desde su publicación en esta página. El uso
          continuado de los servicios implica su aceptación.
        </p>
      </LegalSection>

      <LegalSection title="11. Legislación aplicable y jurisdicción">
        <p>
          Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Para la
          interpretación y cumplimiento, las partes se someten a la jurisdicción de los
          tribunales competentes de Huajuapan de León, Oaxaca, sin perjuicio de su derecho a
          acudir a la Procuraduría Federal del Consumidor (PROFECO) para buscar una
          conciliación conforme a la Ley Federal de Protección al Consumidor.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
