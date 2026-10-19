import { SPECIES, type Severity, type Species, type ZoneKind } from '@predator-guard/ring';
import { isNight, severity as ruleSeverity } from '@predator-guard/rules';

/**
 * Danger evaluation: one place that turns "the model said X, on camera in
 * zone Y, at time Z" into the Danger Type shown on screen and stored in the
 * history.
 *
 * The severity rules engine (`@predator-guard/rules`) owns species x zone x
 * time-of-day. This module only adds the bridge for the free-form names the
 * vision model may return: apex predators the rule table does not list get a
 * predator's treatment, everything else falls back to the `unknown` row.
 */

/** Free-form names worth treating as a predator, even though they are not in the rule table. */
const APEX_PREDATORS: ReadonlySet<string> = new Set([
  'bear',
  'wolf',
  'cougar',
  'mountain lion',
  'mountainlion',
  'bobcat',
  'lynx',
  'alligator',
  'crocodile',
  'wild boar',
  'boar',
  'python',
]);

const KNOWN_SPECIES: ReadonlySet<string> = new Set(SPECIES);

/** Danger Type label per severity - what the screen shows. */
export const DANGER_LABELS: Record<Severity, string> = {
  high: 'CRITICAL',
  medium: 'DANGER',
  low: 'WARNING',
  log: 'MONITOR',
};

/** Sortable danger score per severity (0..100), stored with each detection. */
export const DANGER_SCORES: Record<Severity, number> = {
  high: 90,
  medium: 60,
  low: 30,
  log: 10,
};

/** No animal worth alerting about (e.g. people-only frames). */
export const NO_DANGER = { severity: 'log' as const, dangerType: 'NONE', dangerScore: 0 };

export interface DangerVerdict {
  severity: Severity;
  dangerType: string;
  dangerScore: number;
}

const LIVESTOCK_ZONES: ReadonlySet<ZoneKind> = new Set(['coop', 'pasture']);

export function evaluateDanger(speciesRaw: string, zoneKind: ZoneKind, at: Date): DangerVerdict {
  const species = speciesRaw.trim().toLowerCase();
  let severityLevel: Severity;
  if (KNOWN_SPECIES.has(species)) {
    severityLevel = ruleSeverity({ species: species as Species, zoneKind, localTime: at });
  } else if (APEX_PREDATORS.has(species)) {
    // Big predator in a livestock zone after dark is as bad as it gets.
    severityLevel = LIVESTOCK_ZONES.has(zoneKind) && isNight(at) ? 'high' : 'medium';
  } else {
    // Unknown-to-the-table animal (cat, rabbit, bird...) - behave like `unknown`.
    severityLevel = ruleSeverity({ species: 'unknown', zoneKind, localTime: at });
  }
  return {
    severity: severityLevel,
    dangerType: DANGER_LABELS[severityLevel],
    dangerScore: DANGER_SCORES[severityLevel],
  };
}
