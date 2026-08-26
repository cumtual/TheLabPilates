# Feature: Gestión de Invitados Mensuales para Membresía Open Lab y Control Administrativo

## 1. Resumen y Objetivo
Implementar un sistema de gestión de invitados mensuales exclusivo para usuarios con membresía **Open Lab** al momento de agendar clases, así como herramientas administrativas para que el personal/admin pueda registrar y remover invitados de forma manual en clases programadas.

---

## 2. Reglas de Negocio y Lógica de Créditos

### 2.1. Beneficio de Usuario
* **Elegibilidad:** Exclusivo para usuarios activos con membresía `Open Lab`.
* **Cuota mensual:** 1 crédito de invitado por mes calendario (o ciclo de facturación mensual).
* **Consumo de aforo:** Cada invitado ocupa 1 cupo (*spot*) independiente en la clase.
  * Agendar usuario + invitado = Descuenta 2 cupos de la clase.
  * Se debe validar disponibilidad de al menos 2 cupos al momento de la reserva con invitado.

### 2.2. Política de Cancelación y Reembolso
* **Cancelación con > 24 horas de anticipación:**
  * Se cancela la reserva tanto del usuario titular como de su invitado.
  * Se liberan 2 cupos inmediatamente en la clase.
  * Se reembolsa el crédito de invitado mensual al balance del usuario.
* **Cancelación con < 24 horas de anticipación (fuera de política):**
  * Aplican las reglas de penalización habituales del sistema.
  * Se liberan los cupos según el flujo estándar, pero **NO** se reembolsa el crédito mensual de invitado (queda marcado como utilizado).

---

## 3. Requerimientos Funcionales por Módulo

### 3.1. Flujo de Reserva del Alumno (Frontend / App)
1. **Comprobación de disponibilidad:** Validar si el usuario cumple con la condición de membresía `Open Lab` y tiene saldo disponible (`guest_credits_available > 0`).
2. **Interfaz de reserva:**
   * Mostrar un switch/toggle interactivo: *"¿Deseas agregar un invitado?"*.
   * Si no cumple los requisitos, el switch debe estar oculto o deshabilitado con un tooltip explicativo.
   * Al activar el switch, desplegar un campo de texto requerido: `Nombre completo del invitado`.
3. **Validación de aforo:** Bloquear la confirmación si la clase solo cuenta con 1 cupo disponible al intentar agregar al invitado.

### 3.2. Vista del Coach / Lista de Asistencia
1. **Identificación visual:** Los invitados deben aparecer en la lista de alumnos como un registro individual.
2. **Badge / Tag:** Mostrar una etiqueta distintiva `[Invitado]` junto al nombre.
3. **Detalle de procedencia:** Al hacer clic o hover sobre el nombre/tag del invitado, desplegar un modal o tooltip informativo indicando:
   > *"Invitado por: [Nombre y Apellidos del Usuario Titular o Admin]"*

### 3.3. Panel de Administración (Admin)
1. **Agregar invitado manualmente:**
   * Dentro del detalle de cualquier clase programada, habilitar el botón `+ Agregar Invitado`.
   * Formulario simple para ingresar el nombre del invitado.
   * Ocupa 1 cupo del aforo total de la clase.
   * Queda registrado con la metadata: *"Invitado por: Admin ([Nombre/Email de la cuenta admin])"*.
2. **Eliminar invitado:**
   * El administrador puede remover a cualquier invitado de la lista.
   * Al eliminarlo, el cupo de la clase queda disponible inmediatamente para otros usuarios.

---

## 4. Criterios de Aceptación (Definition of Done)

- [ ] Usuarios sin membresía `Open Lab` o sin créditos disponibles no pueden reservar con invitado.
- [ ] La reserva con invitado descuenta exactamente 2 cupos de la clase.
- [ ] Cancelación con más de 24h devuelve el crédito mensual al usuario titular.
- [ ] Cancelación con menos de 24h descuenta/quema el crédito del usuario.
- [ ] El coach puede ver claramente la etiqueta `[Invitado]` y consultar quién registró a la persona.
- [ ] El administrador puede agregar y retirar invitados manualmente liberando los cupos correspondientes.
- [ ] El diseño de esta implementación va acorde al diseño del proeycto y se adapta correctamente a los diferentes tamaños de pantalla, siguiendo el principio del mobile first.