import { loadMyCourtesies } from '@/modules/cafeteria/presentation/queries';
import type { MyCourtesies } from '@/modules/cafeteria/presentation/types';
import { MyCourtesiesCard } from './MyCourtesiesCard';

/** Carga las cortesías del usuario de la sesión. Si falla, el dashboard sigue sin la tarjeta. */
export async function MyCourtesiesSection() {
  let courtesies: MyCourtesies;
  try {
    courtesies = await loadMyCourtesies();
  } catch {
    return null;
  }
  return <MyCourtesiesCard courtesies={courtesies} />;
}
