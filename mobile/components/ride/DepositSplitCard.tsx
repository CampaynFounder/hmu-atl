// DepositSplitCard — deposit-only payment breakdown shown to BOTH parties during
// an active ride (OTW onward). Makes the on-platform vs off-platform split explicit:
//   • HMU collected the deposit on-platform (Stripe).
//   • The rest is paid rider → driver OFF-platform (cash / Cash App / Apple Pay …).
// Rider and driver see the same numbers, framed for their side. Render only when
// the ride is in deposit-only mode with a cash remainder.

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@/lib/theme';

const METHODS = ['Cash', 'Cash App', 'Apple Pay', 'Venmo', 'Zelle'];
const money = (n: number) => `$${n.toFixed(2)}`;

export function DepositSplitCard({
  variant, deposit, cashDue, total,
}: {
  variant: 'rider' | 'driver';
  deposit: number;
  cashDue: number;
  total: number;
}) {
  const isRider = variant === 'rider';

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="cash-outline" size={13} color={colors.cash} />
        <Text style={s.headerText}>DEPOSIT + CASH</Text>
      </View>

      {/* On-platform: what HMU collected */}
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>{isRider ? 'Paid on HMU (deposit)' : 'Rider paid on HMU (deposit)'}</Text>
          <Text style={s.rowSub}>Collected on the app{isRider ? ' from your card' : ''}</Text>
        </View>
        <Text style={s.rowValue}>{money(deposit)}</Text>
      </View>

      <View style={s.divider} />

      {/* Off-platform: the cash the rider hands the driver */}
      <View style={s.hero}>
        <Text style={s.heroLabel}>
          {isRider ? 'PAY YOUR DRIVER' : 'COLLECT FROM RIDER'}
        </Text>
        <Text style={s.heroAmount}>{money(cashDue)}</Text>
        <Text style={s.heroSub}>
          {isRider ? 'Paid directly to your driver — not through HMU' : 'Paid directly to you — off-platform'}
        </Text>
      </View>

      {/* Accepted off-platform methods (no handles stored — arrange with each other) */}
      <View style={s.methods}>
        {METHODS.map((m) => (
          <View key={m} style={s.chip}><Text style={s.chipText}>{m.toUpperCase()}</Text></View>
        ))}
      </View>
      <Text style={s.methodsHint}>
        {isRider ? 'Ask your driver which they prefer.' : 'Whatever works for you and the rider.'}
      </Text>

      <View style={s.totalRow}>
        <Text style={s.totalLabel}>RIDE TOTAL</Text>
        <Text style={s.totalValue}>{money(total)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.cashBorder,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  headerText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.cash, letterSpacing: 2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  rowSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  rowValue: { fontFamily: fonts.display, fontSize: 26, color: colors.textSecondary },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },

  hero: { alignItems: 'center', paddingVertical: spacing.sm },
  heroLabel: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.cash, letterSpacing: 2 },
  heroAmount: { fontFamily: fonts.display, fontSize: 52, color: colors.cash, lineHeight: 58 },
  heroSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, textAlign: 'center' },

  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: spacing.md },
  chip: {
    backgroundColor: colors.cashDim, borderWidth: 1, borderColor: colors.cashBorder,
    borderRadius: radius.tag, paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  chipText: { fontFamily: fonts.mono, fontSize: 9, color: colors.cash, letterSpacing: 0.5 },
  methodsHint: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, textAlign: 'center', marginTop: spacing.sm },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  totalLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },
  totalValue: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textPrimary },
});
