import type { CafeteriaDeps } from '../application/ports';
import { drizzleUnitOfWork } from './drizzle-unit-of-work';
import { nextMenuCache } from './menu-cache';
import { resendClosingNotifier } from './resend-notifier';
import { systemClock } from './system-clock';

/** Dependencias reales de los casos de uso. Las Server Actions las inyectan. */
export function cafeteriaDeps(): CafeteriaDeps {
  return { uow: drizzleUnitOfWork, clock: systemClock, notifier: resendClosingNotifier, menuCache: nextMenuCache };
}
