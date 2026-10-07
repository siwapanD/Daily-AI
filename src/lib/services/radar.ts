import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { ExperimentDecision, RadarRing } from "../constants";

export async function listRadar() {
  return db.select().from(schema.radarItems).orderBy(asc(schema.radarItems.name));
}

export async function upsertRadarItem(input: {
  name: string; ring: string; quadrant: string; rationale?: string; technologyId?: number | null; experimentId?: number | null;
}) {
  const values = { ...input, rationale: input.rationale ?? "", updatedAt: new Date() };
  const [row] = await db.insert(schema.radarItems).values(values)
    .onConflictDoUpdate({ target: schema.radarItems.name, set: values })
    .returning();
  return row;
}

export async function deleteRadarItem(id: number) {
  await db.delete(schema.radarItems).where(eq(schema.radarItems.id, id));
}

/** Experiment decision → radar ring. RETEST keeps the item in TRIAL. */
export function ringForDecision(d: ExperimentDecision): RadarRing {
  return ({ ADOPT: "ADOPT", WATCH: "ASSESS", REJECT: "HOLD", RETEST: "TRIAL" } as const)[d];
}
