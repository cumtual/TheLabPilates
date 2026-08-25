# The Lab Pilates Experience - Core System & Management

Este documento contiene las especificaciones técnicas completas, el esquema de base de datos y los diagramas de flujos operativos para el desarrollo del backend, lógica serverless y controles interactivos de **The Lab**.

El agente de desarrollo (Kiro) debe implementar todo el sistema apegándose estrictamente a las reglas descritas a continuación, asegurando un enfoque **Mobile-First**, **Responsivo** y consistente con la línea estético-visual de la Landing Page actual.

---

## 🚀 Pilares del Desarrollo

1. **Arquitectura:** Next.js (App Router) optimizado para entornos serverless (Vercel). Toda la lógica de mutaciones e interacción con la base de datos debe ser implementada mediante **Server Actions** o **API Routes** ligeras.
2. **Diseño:** Totalmente responsivo bajo la filosofía **Mobile-First**. Debe reutilizar la paleta de colores, tipografías y componentes estéticos ya definidos en la Landing Page.
3. **Seguridad Absoluta:** Todas las contraseñas deben ser encriptadas mediante algoritmos seguros (`bcrypt` o `argon2`) desde el primer registro de cuenta hasta su restablecimiento. El JWT de sesión tendrá una duración estricta de 1 hora.
4. **Calidad:** Cobertura de pruebas automatizadas (**Testing**) para las reglas críticas de negocio (fechas de expiración, control de aforo, tokens y duplicados).

---

## 📊 1. Modelo de Base de Datos (DBML)

Estructura relacional en PostgreSQL. Kiro debe generar los modelos/migraciones basándose en este diseño, asegurando el cumplimiento estricto del bloque de índices y las llaves foráneas.

```dbml
Enum userRoles {
  client
  coach
  admin
}

Enum paymentTypes{
  cash
  transfer
  card
}

Enum openClassAvailability{
  available
  not_available
  full
}

Enum classTypes{
  yoga
  mat_pilates
  barre
}

Enum openClassStatus {
  scheduled
  cancelled
  completed
}

Enum enrollmentStatus {
  pending
  attended
  absent
  late_cancelled
}

Table users {
  id uuid [primary key]
  username varchar [not null]
  email varchar [not null, unique]
  password varchar [not null] // NOTA: ¡Guardar SIEMPRE encriptada con bcrypt/argon2!
  role userRoles [not null]
  created_at timestamptz [default: `now()`]
}

Table password_resets {
  id uuid [primary key]
  user_id uuid [not null, unique]
  token varchar [not null]
  expires_at timestamptz [not null]
  created_at timestamptz [default: `now()`]
}

Table suscriptions{
  id uuid [primary key]
  name varchar
  sessions integer
  guest boolean
  price integer
}

Table user_suscriptions {
  id uuid [primary key]
  days_remaining integer [default: 0]
  payment_id uuid [not null, unique]
  suscription_id uuid [not null]
  user_id uuid [not null]
  active boolean [default: false]
  expiration_date timestamptz [null] // Permite null al inicio mientras el admin confirma
  created_at timestamptz [default: `now()`]
}

Table payments {
  id uuid [primary key]
  payment_type paymentTypes [not null]
  confirmend boolean [default: false]
  date_confirmed timestamptz [null]
  created_at timestamptz [default: `now()`]
}

Table open_class {
  id uuid [primary key]
  class_date timestamptz [default: `now()`]
  coach_user_id uuid
  capacity integer
  available openClassAvailability [default: 'available']
  class_type classTypes
  status openClassStatus [default: 'scheduled']
  created_at timestamptz [default: `now()`]
}

Table class_enrolleds {
  id uuid [primary key]
  open_class_id uuid [not null]
  user_suscription_id uuid [not null]
  status enrollmentStatus [default: 'pending']
  created_at timestamptz [default: `now()`]

  Indexes {
    (open_class_id, user_suscription_id) [unique, name: "uk_class_user_enrollment"]
  }
}

Ref: password_resets.user_id > users.id [delete: cascade, update: cascade]
Ref: user_suscriptions.payment_id - payments.id [delete: cascade, update: cascade]
Ref: user_suscriptions.suscription_id > suscriptions.id [delete: cascade, update: cascade]
Ref: user_suscriptions.user_id > users.id [delete: cascade, update: cascade]
Ref: open_class.coach_user_id > users.id [delete: cascade, update: cascade]
Ref: class_enrolleds.user_suscription_id > user_suscriptions.id [delete: cascade, update: cascade]
Ref: class_enrolleds.open_class_id > open_class.id [delete: cascade, update: cascade]


## 🔄 2. Arquitectura de Flujos de Negocio (Mermaid)
Este mapa define la lógica exacta de condicionales, pantallas y operaciones transaccionales en caliente que Kiro debe programar en Next.js:
graph TD
    %% 1. FLUJO DE AUTENTICACIÓN & RECUPERACIÓN
    subgraph Auth ["Módulo: Autenticación & Roles"]
        A[Usuario inicia Registro/Login] --> B{¿Elige Google OAuth?}
        
        B -- No --> D[Autenticar con Email/Password]
        D --> D_Check[Validar datos vs password ENCRIPTADA en BD]
        D_Check --> E[Generar JWT: Duración 1 Hora]
        
        B -- Sí --> C[Autenticar con Google API]
        C --> E
        
        E --> F{¿Es usuario nuevo?}
        F -- Sí --> G[Crear Usuario: Rol 'client' por defecto + Password Encriptada]
        F -- No --> H[Cargar Rol Actual del Usuario]
        
        %% FLUJO DE RECUPERACIÓN DE CUENTA
        A --> R1[Usuario da clic en 'Olvidé mi contraseña']
        R1 --> R2[Pantalla: Ingresar Email]
        R2 --> R3{¿El Email existe en la BD?}
        R3 -- No --> R3_Error[Mostrar mensaje genérico por seguridad]
        
        R3 -- Sí --> R4[Generar Token único + Expiración e insertar en password_resets]
        R4 --> R5[Disparar servicio de Email: Enviar enlace con Token]
        R5 --> R6[Usuario hace clic en el enlace del Correo]
        R6 --> R7{¿Token es válido y no ha expirado?}
        R7 -- No --> R7_Error[Pantalla: Enlace inválido o expirado]
        
        R7 -- Sí --> R8[Pantalla: Ingresar nueva contraseña]
        R8 --> R9[Encriptar Nueva Contraseña]
        R9 --> R10[Actualizar users en BD + Eliminar registro en password_resets]
        R10 --> R11[Redirigir a Login con mensaje de éxito]
    end

    %% 2. FLUJO DE CLIENTES
    subgraph Client_Flow ["Portal: Cliente (Mobile-First)"]
        G & H --> ClientHome[Dashboard Cliente]
        
        ClientHome --> C1[Ver Info de Suscripción actual]
        C1 --> C1_Detalles[Clases restantes, Vencimiento, Estatus de pago]
        
        ClientHome --> C2[Comprar / Renovar Suscripción]
        C2 --> C2_Metodo{¿Qué método de pago elige?}
        
        C2_Metodo -- Transferencia --> C2_Transf[Pantalla: Mostrar Datos Bancarios del Estudio]
        C2_Transf --> C2_Transf_Msg[Pantalla: 'Tu transferencia está en proceso de ser confirmada']
        C2_Transf_Msg --> C2_BD_Transf[Crear Registro: Pago Pendiente / Tipo: Transfer]
        
        C2_Metodo -- Efectivo --> C2_Efect[Pantalla: Aviso 'Pago en efectivo directo a administración. Sujeto a confirmación']
        C2_Efect --> C2_BD_Efect[Crear Registro: Pago Pendiente / Tipo: Cash]
        
        C2_Metodo -- Tarjeta / Futuro --> C2_Card_Block[Deshabilitado en UI: Mostrar 'Próximamente']
        
        ClientHome --> C3[Enlistarse en una Clase]
        C3 --> C3_Check1{¿Suscripción activa y days_remaining > 0?}
        C3_Check1 -- No --> C3_Error1[Bloquear Acción]
        C3_Check1 -- Sí --> C3_Check_Duplicate{¿Ya está inscrito a esta clase en class_enrolleds?}
        C3_Check_Duplicate -- Sí --> C3_Error_Duplicate[Bloquear UI: Ya tienes una reserva]
        C3_Check_Duplicate -- No --> C3_Check2{¿Capacidad de la clase disponible?}
        
        C3_Check2 -- No --> C3_Error2[Bloquear UI: Clase Llena]
        C3_Check2 -- Sí --> C3_Exito[Crear Registro en class_enrolleds & Restar 1 clase]
        
        ClientHome --> C4[Cancelar su propia Reservación]
        C4 --> C4_Check{¿Faltan más de 24 horas para la clase?}
        
        C4_Check -- Sí --> C4_Reembolso[Eliminar de class_enrolleds & Devolver +1 clase]
        
        C4_Check -- No --> C4_Warn[Modal UX: Advertir que faltan menos de 24h y NO se reembolsará]
        C4_Warn --> C4_Confirm{¿El usuario confirma la cancelación?}
        C4_Confirm -- No --> C4_CancelAborted[Cerrar Modal: Mantener reservación intacta]
        C4_Confirm -- Sí --> C4_Penalizado[Marcar como 'Late Cancelled' & NO devolver clase]
    end

    %% 3. FLUJO DE COACHES
    subgraph Coach_Flow ["Portal: Coach"]
        H --> CoachHome[Dashboard Coach]
        CoachHome --> Co1[Visualizar Agenda de Clases]
        CoachHome --> Co2[Abrir / Programar Nueva Clase]
        CoachHome --> Co3[Tomar Asistencia de la Clase]
        Co3 --> Co3_Accion[Modificar class_enrolleds: Marcar como 'Attended' o 'Absent']
        CoachHome --> Co4[Intentar Modificar Pagos] --> Co4_Block[BLOQUEADO: Sin permisos]
    end

    %% 4. FLUJO DE ADMINISTRADORES
    subgraph Admin_Flow ["Portal: Administrador"]
        H --> AdminHome[Dashboard Admin]
        AdminHome --> Ad1[Gestión de Roles & Suscripciones]
        Ad1 --> Ad1_Accion[Asignar roles o Suspender user_suscriptions manualmente]
        
        AdminHome --> Ad2[Ver Lista de Pagos Pendientes]
        Ad2 --> Ad2_Confirmar[Confirmar recepción de Efectivo o Transferencia]
        Ad2_Confirmar --> Ad2_Accion[Cambiar confirmend a true en payments]
        Ad2_Accion --> Ad2_Calculo[Activar user_suscriptions: SET active = true]
        Ad2_Calculo --> Ad2_Sesiones[Acumular Sesiones: days_remaining = days_remaining + nuevas_sesiones]
        Ad2_Sesiones --> Ad2_Expiracion[Actualizar Vigencia: expiration_date = AHORA + 30 días]
        
        AdminHome --> Ad3[Gestionar Caso Especial de Cancelación]
        Ad3_Accion --> Ad3_Decision[Admin decide devolver manualmente +1 clase al cliente]
        
        AdminHome --> Ad4[Historial Completo del Cliente]
        Ad4 --> Ad4_Historial[Ver bitácora de Suscripciones, Pagos y Métricas de Asistencias vs Faltas]
        
        AdminHome --> Ad5[Cancelar una Clase completa]
        Ad5 --> Ad5_Accion[Buscar alumnos -> Sumar +1 clase a todos]
        Ad5_Accion --> Ad5_Email[Enviar Correo Automático de Notificación]
    end

    %% BASE DE DATOS
    C2_BD_Transf -.-> BD[(PostgreSQL)]
    C2_BD_Efect -.-> BD
    C3_Exito -.-> BD
    C4_Reembolso -.-> BD
    C4_Penalizado -.-> BD
    Ad2_Expiracion -.-> BD
    Co3_Accion -.-> BD
    R4 -.-> BD
    R10 -.-> BD



## 🧪 3. Requerimientos Esenciales de Testing
Kiro debe implementar una suite completa de pruebas unitarias y de integración (usando Jest o Vitest) enfocado en las siguientes funciones del sistema:
Pruebas de Lógica Core (Backend)
Validación de Encriptación Obligatoria: Garantizar que no existan operaciones de escritura (INSERT o UPDATE) en el campo password de la tabla users que almacenen texto plano.

Flujo de Recuperación de Cuenta: Probar que al cambiar exitosamente la contraseña mediante el token de recuperación, este sea eliminado completamente de password_resets, previniendo ataques de reutilización.

Acumulación y Extensión de Pases: Verificar que al invocar la confirmación administrativa de pago, el query sume las nuevas sesiones a las existentes (days_remaining = days_remaining + X) y calcule la expiration_date exactamente a NOW() + 30 días sin sobreescribir el remanente a cero.

Control de Cancelación Tardía (<24h): Verificar que cancelaciones realizadas en un lapso menor a 24 horas previas a la clase muten el estado del enrollment a late_cancelled y no devuelvan el crédito al contador del cliente.

Restricción de Duplicados: Intentar registrar al mismo usuario dos veces en la misma clase y asegurar que la base de datos falle controladamente disparando la violación del índice único uk_class_user_enrollment.

Pruebas de Interfaz (Frontend UX)
Comportamiento Responsivo (Mobile-First): Validar que las vistas de la agenda y el dashboard colapsen correctamente y mantengan la usabilidad en pantallas móviles estándar (360px - 415px width).

Bloqueo por Roles: Asegurar que los componentes interactivos de confirmación de pago y alteración de roles no se rendericen ni permitan llamadas a funciones si el JWT no cuenta con el rol de admin.