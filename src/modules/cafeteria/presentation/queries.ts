import { getClosingDetail, getOpenShift, getPendingClosings, listClosings } from '../application/use-cases/closings';
import { getCourtesyRules, getMyCourtesies, listCourtesyGrants } from '../application/use-cases/courtesies';
import { getAdminMenu, getRegisterData } from '../application/use-cases/menu';
import { getTodaySummary } from '../application/use-cases/sales';
import { cafeteriaDeps } from '../infrastructure/container';
import { currentActor } from './run-action';

/**
 * Lecturas para las páginas (Server Components). Igual que las acciones, el actor sale
 * de la sesión y cada caso de uso revisa el rol.
 */

const withActor =
  <A extends unknown[], T>(fn: (deps: ReturnType<typeof cafeteriaDeps>, actor: Awaited<ReturnType<typeof currentActor>>, ...args: A) => Promise<T>) =>
  async (...args: A): Promise<T> =>
    fn(cafeteriaDeps(), await currentActor(), ...args);

export const loadRegisterData = withActor(getRegisterData);
export const loadOpenShift = withActor(getOpenShift);
export const loadAdminMenu = withActor(getAdminMenu);
export const loadCourtesyRules = withActor(getCourtesyRules);
export const loadPendingClosings = withActor(getPendingClosings);
export const loadClosings = withActor(listClosings);
export const loadClosingDetail = withActor(getClosingDetail);
export const loadTodaySummary = withActor(getTodaySummary);
export const loadCourtesyGrants = withActor(listCourtesyGrants);
export const loadMyCourtesies = withActor(getMyCourtesies);
