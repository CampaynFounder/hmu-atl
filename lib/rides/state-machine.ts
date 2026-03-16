// Ride State Machine
// Validates state transitions and enforces business rules

export type RideStatus =
  | 'pending' // Rider requested, waiting for driver
  | 'matched' // Driver accepted, heading to pickup
  | 'driver_arrived' // Driver at pickup location
  | 'in_progress' // Ride started, en route to destination
  | 'completed' // Ride finished
  | 'cancelled_by_rider' // Rider cancelled
  | 'cancelled_by_driver' // Driver cancelled
  | 'paid'; // Payment completed

export type RideEvent =
  | 'DRIVER_ACCEPT'
  | 'DRIVER_ARRIVE'
  | 'START_TRIP'
  | 'COMPLETE_TRIP'
  | 'PROCESS_PAYMENT'
  | 'RIDER_CANCEL'
  | 'DRIVER_CANCEL';

// Valid state transitions
const TRANSITIONS: Record<RideStatus, Partial<Record<RideEvent, RideStatus>>> = {
  pending: {
    DRIVER_ACCEPT: 'matched',
    RIDER_CANCEL: 'cancelled_by_rider',
  },
  matched: {
    DRIVER_ARRIVE: 'driver_arrived',
    RIDER_CANCEL: 'cancelled_by_rider',
    DRIVER_CANCEL: 'cancelled_by_driver',
  },
  driver_arrived: {
    START_TRIP: 'in_progress',
    RIDER_CANCEL: 'cancelled_by_rider',
    DRIVER_CANCEL: 'cancelled_by_driver',
  },
  in_progress: {
    COMPLETE_TRIP: 'completed',
  },
  completed: {
    PROCESS_PAYMENT: 'paid',
  },
  cancelled_by_rider: {},
  cancelled_by_driver: {},
  paid: {},
};

export class RideStateMachine {
  /**
   * Check if a state transition is valid
   */
  static canTransition(
    currentStatus: RideStatus,
    event: RideEvent
  ): boolean {
    return !!TRANSITIONS[currentStatus]?.[event];
  }

  /**
   * Get next state for an event, or throw error if invalid
   */
  static getNextState(
    currentStatus: RideStatus,
    event: RideEvent
  ): RideStatus {
    const nextState = TRANSITIONS[currentStatus]?.[event];

    if (!nextState) {
      throw new Error(
        `Invalid transition: Cannot ${event} from ${currentStatus} state`
      );
    }

    return nextState;
  }

  /**
   * Check if ride is in a terminal state (cannot transition further)
   */
  static isTerminalState(status: RideStatus): boolean {
    return (
      status === 'paid' ||
      status === 'cancelled_by_rider' ||
      status === 'cancelled_by_driver'
    );
  }

  /**
   * Check if ride is cancellable
   */
  static isCancellable(status: RideStatus): boolean {
    return status === 'pending' || status === 'matched' || status === 'driver_arrived';
  }

  /**
   * Check if ride is active (driver and rider involved)
   */
  static isActive(status: RideStatus): boolean {
    return (
      status === 'matched' ||
      status === 'driver_arrived' ||
      status === 'in_progress'
    );
  }

  /**
   * Get human-readable status message
   */
  static getStatusMessage(status: RideStatus): string {
    const messages: Record<RideStatus, string> = {
      pending: 'Finding a driver...',
      matched: 'Driver is on the way',
      driver_arrived: 'Driver has arrived',
      in_progress: 'Trip in progress',
      completed: 'Trip completed',
      cancelled_by_rider: 'Cancelled by rider',
      cancelled_by_driver: 'Cancelled by driver',
      paid: 'Payment completed',
    };
    return messages[status];
  }
}

/**
 * Validation: Ensure driver can only accept if available
 */
export function validateDriverAccept(driverStatus: string): void {
  if (driverStatus !== 'available') {
    throw new Error('Driver must be available to accept rides');
  }
}

/**
 * Validation: Ensure trip can start (driver must be at pickup)
 */
export function validateTripStart(
  rideStatus: RideStatus,
  driverAtPickup: boolean
): void {
  if (rideStatus !== 'driver_arrived') {
    throw new Error('Driver must arrive before starting trip');
  }
  if (!driverAtPickup) {
    throw new Error('Driver must be at pickup location');
  }
}

/**
 * Calculate cancellation fee based on ride status
 * No fee if cancelled before driver accepts
 * Small fee if driver is en route
 * Full cancellation fee if driver arrived
 */
export function calculateCancellationFee(
  status: RideStatus,
  baseFare: number
): number {
  switch (status) {
    case 'pending':
      return 0; // No fee
    case 'matched':
      return Math.round(baseFare * 0.25); // 25% fee
    case 'driver_arrived':
      return Math.round(baseFare * 0.5); // 50% fee
    default:
      return 0;
  }
}
