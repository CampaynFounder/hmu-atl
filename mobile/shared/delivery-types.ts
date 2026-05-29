// Delivery marketplace types — Request Pickup feature.
// Additive: no existing types modified.

export type DeliveryStatus =
  | 'pending'
  | 'courier_accepted'
  | 'at_merchant'
  | 'receipt_uploaded'
  | 'en_route'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export interface DeliveryItem {
  id: string;
  name: string;
  quantity: number;
  estimatedPrice: number;
  notes?: string;
  photoUri?: string; // local only during creation
}

export interface DeliveryEstimate {
  estimatedMerchantSpend: number;
  deliveryFee: number;
  platformFee: number;
  authBuffer: number;
  totalHold: number;
  // Courier-facing payout breakdown
  courierEarn: number;       // delivery fee minus platform cut
  courierAdvance: number;    // merchant spend courier fronts at store
  courierGuaranteed: number; // total courier receives on verified completion
}

export interface DeliveryRequest {
  id: string;
  status: DeliveryStatus;
  merchantName: string;
  merchantAddress: string;
  merchantLat: number;
  merchantLng: number;
  customerAddress: string;
  customerLat: number;
  customerLng: number;
  items: DeliveryItem[];
  estimate: DeliveryEstimate;
  deliveryPin?: string;
  receiptUrl?: string;
  receiptTotal?: number;
  courierName?: string;
  courierHandle?: string;
  courierAvatarUrl?: string;
  courierLat?: number;
  courierLng?: number;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
}

// Shape returned by GET /api/delivery/nearby — courier opportunity feed
export interface DeliveryOpportunity {
  id: string;
  merchantName: string;
  merchantAddress: string;
  customerAreaSlug: string;
  items: { name: string; quantity: number }[];
  itemCount: number;
  estimatedMerchantSpend: number;
  deliveryFee: number;
  courierEarn: number;
  courierAdvance: number;
  courierGuaranteed: number;
  distanceMiles: number;
  expiresAt: string;
  createdAt: string;
}
