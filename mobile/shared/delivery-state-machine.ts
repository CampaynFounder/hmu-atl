// Delivery state machine — mirrors ride state machine pattern.
// Pure, no server dependencies.

import type { DeliveryStatus } from './delivery-types';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:          ['courier_accepted', 'cancelled'],
  courier_accepted: ['at_merchant', 'cancelled'],
  at_merchant:      ['receipt_uploaded', 'cancelled'],
  receipt_uploaded: ['en_route', 'at_merchant'],
  en_route:         ['delivered', 'cancelled'],
  delivered:        ['completed', 'disputed'],
  disputed:         ['completed'],
};

export function validateDeliveryTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return !!(allowed && allowed.includes(to));
}

export function getDeliveryStatusLabel(status: DeliveryStatus): string {
  const labels: Record<DeliveryStatus, string> = {
    pending:          'REQUEST SUBMITTED',
    courier_accepted: 'COURIER ACCEPTED',
    at_merchant:      'AT MERCHANT',
    receipt_uploaded: 'RECEIPT UPLOADED',
    en_route:         'EN ROUTE',
    delivered:        'DELIVERED',
    completed:        'COMPLETED',
    cancelled:        'CANCELLED',
    disputed:         'UNDER REVIEW',
  };
  return labels[status] ?? status.toUpperCase().replace(/_/g, ' ');
}

export function getDeliveryStatusSubtitle(status: DeliveryStatus): string {
  const subtitles: Record<DeliveryStatus, string> = {
    pending:          'Looking for a courier near the merchant',
    courier_accepted: 'Your courier is heading to the store',
    at_merchant:      'Courier is purchasing your items now',
    receipt_uploaded: 'Receipt uploaded — courier is heading your way',
    en_route:         'Items are on their way to you',
    delivered:        'Enter your PIN to confirm receipt',
    completed:        'Delivery confirmed. Payment released.',
    cancelled:        'This request was cancelled',
    disputed:         'Our team is reviewing this delivery',
  };
  return subtitles[status] ?? '';
}

// The ordered pipeline shown on the customer status tracker
export const DELIVERY_STATUS_STEPS: DeliveryStatus[] = [
  'pending',
  'courier_accepted',
  'at_merchant',
  'receipt_uploaded',
  'en_route',
  'delivered',
  'completed',
];

export function isActiveDelivery(status: DeliveryStatus): boolean {
  return ['courier_accepted', 'at_merchant', 'receipt_uploaded', 'en_route', 'delivered'].includes(status);
}

export function isCourierActiveStep(status: DeliveryStatus): boolean {
  return ['courier_accepted', 'at_merchant', 'receipt_uploaded', 'en_route', 'delivered'].includes(status);
}
