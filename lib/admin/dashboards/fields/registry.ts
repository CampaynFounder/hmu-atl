// Central field registry. Adding a new field = import here + append.
// Keys are stable strings stored in admin_dashboard_blocks.field_keys[].

import type { AnyFieldDefinition, FieldMetadata } from './types';
import { fieldMetadata } from './types';
import { identityFields } from './identity';
import { verificationFields } from './verification';
import { areaFields } from './areas';
import { activityFields } from './activity';
import { ratingFields } from './ratings';
import { hmuFields } from './hmu';
import { notesFields } from './notes';

const ALL_FIELDS: AnyFieldDefinition[] = [
  ...identityFields,
  ...verificationFields,
  ...areaFields,
  ...activityFields,
  ...ratingFields,
  ...hmuFields,
  ...notesFields,
];

export const FIELDS: Record<string, AnyFieldDefinition> = Object.fromEntries(
  ALL_FIELDS.map((f) => [f.key, f]),
);

export function getField(key: string): AnyFieldDefinition | undefined {
  return FIELDS[key];
}

export function listFields(opts?: { includeDeprecated?: boolean }): AnyFieldDefinition[] {
  return ALL_FIELDS.filter((f) => opts?.includeDeprecated || !f.deprecated);
}

export function listFieldMetadata(): FieldMetadata[] {
  return listFields().map(fieldMetadata);
}

// Categories in display order. Builder UI groups the picker accordingly.
export const FIELD_CATEGORY_ORDER = [
  'Identity',
  'Verification',
  'Areas',
  'Activity',
  'Ratings',
  'HMU',
  'Notes',
];
