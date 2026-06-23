import type { ComponentType, CSSProperties } from 'react';
import {
  Visa, Mastercard, Amex, Discover, Diners, Jcb, UnionPay, Maestro,
  Applepay, Googlepay, Generic,
} from 'react-pay-icons';

// Official-style brand marks for saved payment methods. Driven entirely by the
// data the API already returns (isApplePay/isGooglePay/isCashAppPay + brand), so
// the rider sees the real Apple Pay / Visa / Amex / … mark instead of an emoji.
// react-pay-icons renders card-shaped SVGs (~1.6:1) with their own backgrounds.

interface MethodLike {
  brand?: string | null;
  isApplePay?: boolean;
  isGooglePay?: boolean;
  isCashAppPay?: boolean;
}

type IconComp = ComponentType<{ style?: CSSProperties }>;

const BRAND_ICON: Record<string, IconComp> = {
  visa: Visa,
  mastercard: Mastercard,
  amex: Amex,
  american_express: Amex,
  discover: Discover,
  diners: Diners,
  diners_club: Diners,
  jcb: Jcb,
  unionpay: UnionPay,
  union_pay: UnionPay,
  maestro: Maestro,
};

export function resolvePaymentIcon(m: MethodLike): IconComp {
  if (m.isApplePay) return Applepay;
  if (m.isGooglePay) return Googlepay;
  // react-pay-icons has no Cash App mark — fall back to the generic card.
  if (m.isCashAppPay) return Generic;
  const key = (m.brand || '').toLowerCase().replace(/\s+/g, '_');
  return BRAND_ICON[key] ?? Generic;
}

export function PaymentMark({ m, width = 40 }: { m: MethodLike; width?: number }) {
  const Icon = resolvePaymentIcon(m);
  return <Icon style={{ width, display: 'block', borderRadius: 4 }} />;
}
