import { KEYSIG_ID_BASE, keySigByRid } from '../../learn/keysig';
import { RHYTHM_ID_BASE, symbolById } from '../../learn/rhythm';
import { bothNames } from '../../learn/staff';

/** Name of a review-queue id: a pitch (both names for a black key), a rhythm symbol or a key signature. */
export function reviewLabel(id: number): string {
  if (id >= KEYSIG_ID_BASE) return keySigByRid(id)?.name ?? `Key ${id}`;
  if (id >= RHYTHM_ID_BASE) return symbolById(id)?.name ?? `Symbol ${id}`;
  return bothNames(id);
}
