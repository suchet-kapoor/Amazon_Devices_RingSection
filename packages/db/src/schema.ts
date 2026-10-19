import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { DETECTION_STATUSES, SEVERITIES, ZONE_KINDS } from '@predator-guard/ring';

/**
 * `@predator-guard/db` - the Postgres data model for the demo.
 *
 * Two tables: the cameras the user registers in the app, and the analysis
 * history - one row per frame fed to the AI model, holding timestamp,
 * animal type, animal score and danger type so the dashboard can show the
 * result live and replay the history per camera.
 *
 * Domain vocabularies (zone kinds, severities, statuses) are imported from
 * `@predator-guard/ring` so the schema and the rules engine cannot drift.
 * `species` is free text on purpose: the vision model may answer with any
 * common animal name (bear, wolf, mountain lion...), not just the rule
 * table's list.
 *
 * Column names are snake_case to match the SQL in `migrations.ts`; property
 * names are camelCase for the TypeScript side.
 */

const tz = { withTimezone: true } as const;

/** One camera the user registered (name + the zone it watches). */
export const cameras = pgTable(
  'cameras',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Drives the severity rules: coop / pasture / shed / gate. */
    zoneKind: text('zone_kind', { enum: ZONE_KINDS }).notNull().default('gate'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('cameras_name_idx').on(table.name)],
);

/** One analysed frame: what was seen, how sure, how dangerous, when and where. */
export const detections = pgTable(
  'detections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cameraId: uuid('camera_id')
      .notNull()
      .references(() => cameras.id, { onDelete: 'cascade' }),
    /** Animal type as the model named it (lowercase, free-form). */
    species: text('species').notNull().default('unknown'),
    /** Model confidence, 0..100 - the "Animal Score" shown on screen. */
    animalScore: real('animal_score').notNull().default(0),
    /** CRITICAL | DANGER | WARNING | MONITOR | NONE - the "Danger Type". */
    dangerType: text('danger_type').notNull().default('MONITOR'),
    /** Rules-engine severity behind the label (high/medium/low/log). */
    severity: text('severity', { enum: SEVERITIES }).notNull().default('log'),
    /** 0..100 derived from severity - the sortable danger score. */
    dangerScore: integer('danger_score').notNull().default(0),
    model: text('model'),
    peopleOnly: boolean('people_only').notNull().default(false),
    status: text('status', { enum: DETECTION_STATUSES }).notNull().default('done'),
    /** When the frame was captured. */
    capturedAt: timestamp('captured_at', tz).notNull(),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [index('detections_camera_captured_idx').on(table.cameraId, table.capturedAt)],
);

export type Camera = typeof cameras.$inferSelect;
export type Detection = typeof detections.$inferSelect;
