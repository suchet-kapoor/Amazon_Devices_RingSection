import { eq } from 'drizzle-orm';

import { farms, type Db } from '@predator-guard/db';

/**
 * Farm lookup and creation. A farm is the tenancy root: every zone, device,
 * rule and alert hangs off one, and exactly one farm is bound to one Ring
 * account (`farms_ring_account_id_idx` unique).
 */

export type Farm = typeof farms.$inferSelect;

export async function findFarmByRingAccountId(db: Db, ringAccountId: string): Promise<Farm | null> {
  const rows = await db
    .select()
    .from(farms)
    .where(eq(farms.ringAccountId, ringAccountId))
    .limit(1);
  return rows[0] ?? null;
}

/** The demo runs a single farm; this is it (oldest wins). */
export async function getPrimaryFarm(db: Db): Promise<Farm | null> {
  const rows = await db.select().from(farms).orderBy(farms.createdAt).limit(1);
  return rows[0] ?? null;
}

export async function createFarm(
  db: Db,
  input: { name: string; ownerEmail: string; ringAccountId: string },
): Promise<Farm> {
  const rows = await db.insert(farms).values(input).returning();
  return rows[0]!;
}
