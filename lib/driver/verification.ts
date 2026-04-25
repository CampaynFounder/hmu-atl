// Verification status for express drivers — derived, never stored.
// A driver is "verified" once the deferred-in-express trust signals are
// in place: legal name (Stripe KYC) + license plate (rider-side car ID).
// Video intro is a nice-to-have and does NOT gate verification today.
//
// We expose this as a single helper so the browse query, the driver
// share page, and any future ride-rules code agree on the definition.

export interface VerificationInputs {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  // license_plate lives inside vehicle_info JSONB; callers extract it.
  licensePlate: string | null | undefined;
}

export type VerificationStatus = 'verified' | 'pending';

export function deriveVerificationStatus(input: VerificationInputs): VerificationStatus {
  const hasName = !!(input.firstName && input.firstName.trim() && input.lastName && input.lastName.trim());
  const hasPlate = !!(input.licensePlate && input.licensePlate.trim());
  return hasName && hasPlate ? 'verified' : 'pending';
}

export function isVerified(input: VerificationInputs): boolean {
  return deriveVerificationStatus(input) === 'verified';
}
