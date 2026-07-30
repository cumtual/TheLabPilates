/**
 * Database Seed Script
 *
 * Crea datos de prueba para la aplicación The Lab Pilates Studio.
 *
 * Uso:
 *   npx tsx src/db/seed.ts
 *
 * Requisitos:
 *   - DATABASE_URL_DIRECT debe estar definida en .env.local
 *   - Las tablas deben existir (ejecutar `npm run db:push` primero)
 *
 * Credenciales de prueba:
 *   Admin:  admin@thelabpilates.com / admin1234
 *   Coach:  coach@thelabpilates.com / coach1234
 *   Client: maria@example.com / client1234
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import * as schema from './schema';

// Load env from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL_DIRECT;
if (!connectionString) {
  console.error('❌ DATABASE_URL_DIRECT no está definida en .env.local');
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log('🌱 Iniciando seed de la base de datos...\n');

  // ─────────────────────────────────────────────────────
  // 1. Limpiar tablas existentes (orden inverso por FK)
  // ─────────────────────────────────────────────────────
  console.log('🗑️  Limpiando tablas...');
  await db.delete(schema.classEnrollments);
  await db.delete(schema.openClasses);
  await db.delete(schema.userSubscriptions);
  await db.delete(schema.payments);
  await db.delete(schema.passwordResets);
  await db.delete(schema.subscriptions);
  await db.delete(schema.users);
  console.log('   ✓ Tablas limpiadas\n');

  // ─────────────────────────────────────────────────────
  // 2. Crear usuarios
  // ─────────────────────────────────────────────────────
  console.log('👤 Creando usuarios...');
  const adminPassword = await hash('admin1234', 12);
  const coachPassword = await hash('coach1234', 12);
  const clientPassword = await hash('client1234', 12);

  const [admin] = await db.insert(schema.users).values({
    id: randomUUID(),
    username: 'Administrador',
    email: 'admin@thelabpilates.com',
    password: adminPassword,
    role: 'admin',
  }).returning();

  const [coach] = await db.insert(schema.users).values({
    id: randomUUID(),
    username: 'Laura Martínez',
    email: 'coach@thelabpilates.com',
    password: coachPassword,
    role: 'coach',
  }).returning();

  const [client1] = await db.insert(schema.users).values({
    id: randomUUID(),
    username: 'María García',
    email: 'maria@example.com',
    password: clientPassword,
    role: 'client',
  }).returning();

  const [client2] = await db.insert(schema.users).values({
    id: randomUUID(),
    username: 'Ana López',
    email: 'ana@example.com',
    password: clientPassword,
    role: 'client',
  }).returning();

  const [client3] = await db.insert(schema.users).values({
    id: randomUUID(),
    username: 'Carlos Ruiz',
    email: 'carlos@example.com',
    password: clientPassword,
    role: 'client',
  }).returning();

  console.log(`   ✓ Admin:  ${admin.email}`);
  console.log(`   ✓ Coach:  ${coach.email}`);
  console.log(`   ✓ Client: ${client1.email}`);
  console.log(`   ✓ Client: ${client2.email}`);
  console.log(`   ✓ Client: ${client3.email}\n`);

  // ─────────────────────────────────────────────────────
  // 3. Crear paquetes de suscripción
  // ─────────────────────────────────────────────────────
  console.log('📦 Creando paquetes de suscripción...');
  const [labPass] = await db.insert(schema.subscriptions).values({
    id: randomUUID(),
    name: 'Lab Pass',
    sessions: 1,
    guest: false,
    price: 120,
  }).returning();

  const [labEntry] = await db.insert(schema.subscriptions).values({
    id: randomUUID(),
    name: 'Lab Entry',
    sessions: 4,
    guest: false,
    price: 460,
  }).returning();

  const [labPractice] = await db.insert(schema.subscriptions).values({
    id: randomUUID(),
    name: 'Lab Practice',
    sessions: 8,
    guest: false,
    price: 880,
  }).returning();

  const [labProgress] = await db.insert(schema.subscriptions).values({
    id: randomUUID(),
    name: 'Lab Progress',
    sessions: 12,
    guest: false,
    price: 1260,
  }).returning();

  const [openLab] = await db.insert(schema.subscriptions).values({
    id: randomUUID(),
    name: 'Open Lab',
    sessions: 30,
    guest: true,
    price: 2850,
  }).returning();

  console.log(`   ✓ ${labPass.name} - $${labPass.price}`);
  console.log(`   ✓ ${labEntry.name} - $${labEntry.price}`);
  console.log(`   ✓ ${labPractice.name} - $${labPractice.price}`);
  console.log(`   ✓ ${labProgress.name} - $${labProgress.price}`);
  console.log(`   ✓ ${openLab.name} - $${openLab.price}\n`);

  // ─────────────────────────────────────────────────────
  // 4. Crear pagos y suscripciones activas para clientes
  // ─────────────────────────────────────────────────────
  console.log('💳 Creando pagos y suscripciones...');

  // María: Lab Practice (8 sesiones) — confirmado y activo
  const [payment1] = await db.insert(schema.payments).values({
    id: randomUUID(),
    paymentType: 'transfer',
    confirmed: true,
    dateConfirmed: new Date(),
  }).returning();

  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 30);

  const [userSub1] = await db.insert(schema.userSubscriptions).values({
    id: randomUUID(),
    paymentId: payment1.id,
    subscriptionId: labPractice.id,
    userId: client1.id,
    active: true,
    daysRemaining: 6, // ya usó 2 sesiones
    expirationDate,
  }).returning();

  // Ana: Lab Entry (4 sesiones) — pago pendiente de confirmación
  const [payment2] = await db.insert(schema.payments).values({
    id: randomUUID(),
    paymentType: 'cash',
    confirmed: false,
  }).returning();

  const [userSub2] = await db.insert(schema.userSubscriptions).values({
    id: randomUUID(),
    paymentId: payment2.id,
    subscriptionId: labEntry.id,
    userId: client2.id,
    active: false,
    daysRemaining: 0,
    expirationDate: null,
  }).returning();

  // Carlos: Lab Progress (12 sesiones) — confirmado y activo
  const [payment3] = await db.insert(schema.payments).values({
    id: randomUUID(),
    paymentType: 'transfer',
    confirmed: true,
    dateConfirmed: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // hace 7 días
  }).returning();

  const expirationDate2 = new Date();
  expirationDate2.setDate(expirationDate2.getDate() + 23); // le quedan 23 días

  const [userSub3] = await db.insert(schema.userSubscriptions).values({
    id: randomUUID(),
    paymentId: payment3.id,
    subscriptionId: labProgress.id,
    userId: client3.id,
    active: true,
    daysRemaining: 10,
    expirationDate: expirationDate2,
  }).returning();

  console.log(`   ✓ María: Lab Practice (activo, 6 créditos restantes)`);
  console.log(`   ✓ Ana: Lab Entry (pago pendiente)`);
  console.log(`   ✓ Carlos: Lab Progress (activo, 10 créditos restantes)\n`);

  // ─────────────────────────────────────────────────────
  // 5. Crear clases programadas
  // ─────────────────────────────────────────────────────
  console.log('🏋️ Creando clases...');

  // Clases pasadas (para historial y asistencia)
  const pastDate1 = new Date();
  pastDate1.setDate(pastDate1.getDate() - 5);
  pastDate1.setHours(9, 0, 0, 0);

  const pastDate2 = new Date();
  pastDate2.setDate(pastDate2.getDate() - 3);
  pastDate2.setHours(10, 0, 0, 0);

  const pastDate3 = new Date();
  pastDate3.setDate(pastDate3.getDate() - 1);
  pastDate3.setHours(8, 0, 0, 0);

  const [pastClass1] = await db.insert(schema.openClasses).values({
    id: randomUUID(),
    classDate: pastDate1,
    coachUserId: coach.id,
    capacity: 10,
    classType: 'mat_pilates',
    status: 'completed',
    available: 'available',
  }).returning();

  const [pastClass2] = await db.insert(schema.openClasses).values({
    id: randomUUID(),
    classDate: pastDate2,
    coachUserId: coach.id,
    capacity: 8,
    classType: 'barre',
    status: 'completed',
    available: 'available',
  }).returning();

  const [pastClass3] = await db.insert(schema.openClasses).values({
    id: randomUUID(),
    classDate: pastDate3,
    coachUserId: coach.id,
    capacity: 12,
    classType: 'yoga',
    status: 'completed',
    available: 'available',
  }).returning();

  // Clases futuras (para inscripción)
  const futureDate1 = new Date();
  futureDate1.setDate(futureDate1.getDate() + 1);
  futureDate1.setHours(9, 0, 0, 0);

  const futureDate2 = new Date();
  futureDate2.setDate(futureDate2.getDate() + 2);
  futureDate2.setHours(10, 0, 0, 0);

  const futureDate3 = new Date();
  futureDate3.setDate(futureDate3.getDate() + 3);
  futureDate3.setHours(8, 0, 0, 0);

  const futureDate4 = new Date();
  futureDate4.setDate(futureDate4.getDate() + 4);
  futureDate4.setHours(17, 0, 0, 0);

  const futureDate5 = new Date();
  futureDate5.setDate(futureDate5.getDate() + 5);
  futureDate5.setHours(11, 0, 0, 0);

  const [futureClass1] = await db.insert(schema.openClasses).values({
    id: randomUUID(),
    classDate: futureDate1,
    coachUserId: coach.id,
    capacity: 10,
    classType: 'mat_pilates',
    status: 'scheduled',
    available: 'available',
  }).returning();

  const [futureClass2] = await db.insert(schema.openClasses).values({
    id: randomUUID(),
    classDate: futureDate2,
    coachUserId: coach.id,
    capacity: 8,
    classType: 'barre',
    status: 'scheduled',
    available: 'available',
  }).returning();

  const [futureClass3] = await db.insert(schema.openClasses).values({
    id: randomUUID(),
    classDate: futureDate3,
    coachUserId: coach.id,
    capacity: 12,
    classType: 'yoga',
    status: 'scheduled',
    available: 'available',
  }).returning();

  const [futureClass4] = await db.insert(schema.openClasses).values({
    id: randomUUID(),
    classDate: futureDate4,
    coachUserId: coach.id,
    capacity: 6,
    classType: 'mat_pilates',
    status: 'scheduled',
    available: 'available',
  }).returning();

  const [futureClass5] = await db.insert(schema.openClasses).values({
    id: randomUUID(),
    classDate: futureDate5,
    coachUserId: coach.id,
    capacity: 10,
    classType: 'barre',
    status: 'scheduled',
    available: 'available',
  }).returning();

  console.log('   ✓ 3 clases pasadas (completadas)');
  console.log('   ✓ 5 clases futuras (programadas)\n');

  // ─────────────────────────────────────────────────────
  // 6. Crear inscripciones (enrollments)
  // ─────────────────────────────────────────────────────
  console.log('📋 Creando inscripciones...');

  // María asistió a las clases pasadas
  await db.insert(schema.classEnrollments).values({
    id: randomUUID(),
    openClassId: pastClass1.id,
    userSubscriptionId: userSub1.id,
    status: 'attended',
  });

  await db.insert(schema.classEnrollments).values({
    id: randomUUID(),
    openClassId: pastClass2.id,
    userSubscriptionId: userSub1.id,
    status: 'attended',
  });

  // María inscrita en clases futuras (pendientes)
  await db.insert(schema.classEnrollments).values({
    id: randomUUID(),
    openClassId: futureClass1.id,
    userSubscriptionId: userSub1.id,
    status: 'pending',
  });

  await db.insert(schema.classEnrollments).values({
    id: randomUUID(),
    openClassId: futureClass3.id,
    userSubscriptionId: userSub1.id,
    status: 'pending',
  });

  // Carlos asistió a una clase pasada y faltó a otra
  await db.insert(schema.classEnrollments).values({
    id: randomUUID(),
    openClassId: pastClass1.id,
    userSubscriptionId: userSub3.id,
    status: 'attended',
  });

  await db.insert(schema.classEnrollments).values({
    id: randomUUID(),
    openClassId: pastClass3.id,
    userSubscriptionId: userSub3.id,
    status: 'absent',
  });

  // Carlos inscrito en una clase futura
  await db.insert(schema.classEnrollments).values({
    id: randomUUID(),
    openClassId: futureClass2.id,
    userSubscriptionId: userSub3.id,
    status: 'pending',
  });

  console.log('   ✓ María: 2 asistencias + 2 reservaciones pendientes');
  console.log('   ✓ Carlos: 1 asistencia + 1 ausencia + 1 reservación pendiente\n');

  // ─────────────────────────────────────────────────────
  // Resumen final
  // ─────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('✅ Seed completado exitosamente!');
  console.log('═══════════════════════════════════════════════\n');
  console.log('📋 Credenciales de acceso:\n');
  console.log('   ┌─────────────────────────────────────────────┐');
  console.log('   │ Rol     │ Email                    │ Password │');
  console.log('   ├─────────────────────────────────────────────┤');
  console.log('   │ Admin   │ admin@thelabpilates.com  │ admin1234│');
  console.log('   │ Coach   │ coach@thelabpilates.com  │ coach1234│');
  console.log('   │ Client  │ maria@example.com        │ client1234│');
  console.log('   │ Client  │ ana@example.com          │ client1234│');
  console.log('   │ Client  │ carlos@example.com       │ client1234│');
  console.log('   └─────────────────────────────────────────────┘\n');
  console.log('🔗 URLs de prueba:');
  console.log('   • http://localhost:3000/login');
  console.log('   • http://localhost:3000/client  (María o Carlos)');
  console.log('   • http://localhost:3000/coach   (Laura)');
  console.log('   • http://localhost:3000/admin   (Administrador)\n');
}

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error durante el seed:', error);
    process.exit(1);
  });
