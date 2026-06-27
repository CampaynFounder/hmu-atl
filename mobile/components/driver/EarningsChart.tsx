// Stacked driver-earnings chart — mobile parity with the web EarningsChart
// (components/driver/earnings-chart.tsx). Each bar stacks the three revenue
// streams a driver actually earns:
//   • CASH      — cash fares collected on pickup            (gold)
//   • DEPOSITS  — digital deposits + extras (app pay)        (green)
//   • DELIVERY  — store-run / delivery net courier fees      (blue)
//
// Bars are SVG rects grown from the baseline by a single Animated progress
// value (0→1). Uses React Native's built-in Animated (NOT reanimated):
// reanimated's useAnimatedProps on an SVG <Rect> silently no-ops in our build,
// leaving every bar at height 0 (invisible) — so the legend + gridlines drew
// but the bars never did. RN Animated + AnimatedRect is the battle-tested path
// (the drill sheet below already uses it). Tapping a bar drills into that
// period's split via <EarningsDrillSheet/>, which the screen renders.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, LayoutChangeEvent,
  Animated as RNAnimated, Easing as RNEasing,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@/lib/theme';

// Stream colors — aligned to the existing wallet tiles, NOT web's green-cash,
// so the chart legend matches the CASH / DEPOSITS tiles the driver already sees.
export const STREAMS = {
  cash: { key: 'cash' as const, label: 'Cash', color: colors.cash },
  nonCash: { key: 'nonCash' as const, label: 'HMU Pay', color: colors.green },
  delivery: { key: 'delivery' as const, label: 'Delivery', color: colors.blue },
};

export interface StackPoint {
  /** Bucket label drawn under the bar (e.g. "Mon", "Apr 6", "May"). */
  label: string;
  /** Long label for the drill sheet header (e.g. "Mon, Apr 6"). */
  fullLabel: string;
  cash: number;
  nonCash: number;
  delivery: number;
  rides: number;
  /** Completed delivery jobs in this bucket (for the drill sheet). */
  jobs?: number;
}

// ── Axis helpers ────────────────────────────────────────────────────────────

function niceCeil(v: number): number {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * pow;
}

function money(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

// ── Stacked segment ─────────────────────────────────────────────────────────
// Grows from the chart baseline by `progress` (0→1). Independent per segment:
// scaling the whole column from the baseline maps a final edge y to B-(B-y)*p,
// so each segment only needs its own final top + height.
//
// CRITICAL — render a PLAIN <Rect>, never an Animated SVG component. On the New
// Architecture (Fabric, Expo SDK 56 / RN 0.85+), animating react-native-svg
// props via *either* reanimated's useAnimatedProps OR the legacy Animated API
// silently no-ops: the rect is created at its initial value (height 0) and never
// updates, so bars stay invisible while the static gridlines still draw. That is
// THE recurring "chart shows nothing" bug. We instead take a plain numeric
// `progress` (driven by JS state in <EarningsChart/>, the proven count-up
// pattern) and recompute geometry each render — plain SVG rects always draw.

function Segment({
  x, width, baseline, yTop, height, color, progress, roundTop,
}: {
  x: number; width: number; baseline: number; yTop: number; height: number;
  color: string; progress: number; roundTop: boolean;
}) {
  // Grow from the baseline: bottom edge rises baseline→yTop, height grows
  // 0→height, scaling the whole column proportionally as progress goes 0→1.
  const h = Math.max(height, 0) * progress;
  if (h <= 0.5) return null;
  const y = baseline - (baseline - yTop) * progress;
  return (
    <Rect
      x={x}
      width={width}
      y={y}
      height={h}
      rx={roundTop ? 2 : 0}
      fill={color}
    />
  );
}

// ── Chart ───────────────────────────────────────────────────────────────────

const CHART_HEIGHT = 150;
const AXIS_W = 34;      // left gutter for $ labels
const LABEL_H = 16;     // bottom gutter for x labels
const TOP_PAD = 8;      // headroom above the tallest bar
const MIN_SEG_PX = 3;   // smallest visible height for a non-zero stream segment

export function EarningsChart({
  data, onDrill,
}: {
  data: StackPoint[];
  onDrill?: (p: StackPoint, index: number) => void;
}) {
  const [width, setWidth] = useState(0);
  // Grow factor (0→1) held in React state, NOT bound to SVG via Animated — see
  // the note on <Segment/>. An Animated.Value drives the timing; its listener
  // pushes each frame into state so plain <Rect>s re-render. The completion
  // callback pins it to exactly 1 so bars always finish fully drawn even if a
  // frame tick is dropped.
  const [progress, setProgress] = useState(0);
  // Re-run the grow animation whenever the bucket set changes (period switch).
  const sig = data.map((d) => d.label).join('|') + ':' + data.length;

  useEffect(() => {
    const driver = new RNAnimated.Value(0);
    setProgress(0);
    const id = driver.addListener(({ value }) => setProgress(value));
    const anim = RNAnimated.timing(driver, {
      toValue: 1,
      duration: 750,
      easing: RNEasing.out(RNEasing.cubic),
      useNativeDriver: false,
    });
    anim.start(() => setProgress(1));
    return () => {
      anim.stop();
      driver.removeListener(id);
    };
  }, [sig]);

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w && Math.abs(w - width) > 1) setWidth(w);
  }

  const plotH = CHART_HEIGHT - LABEL_H;
  const baseline = plotH; // y of the x-axis inside the svg plot region
  const plotW = Math.max(width - AXIS_W, 0);

  const totals = data.map((d) => d.cash + d.nonCash + d.delivery);
  const max = niceCeil(Math.max(...totals, 0));
  const usableH = baseline - TOP_PAD;
  const scale = max > 0 ? usableH / max : 0;

  const n = data.length || 1;
  const slot = plotW / n;
  const barW = Math.min(Math.max(slot * 0.6, 4), 26);
  const gap = (slot - barW) / 2;

  // X-tick thinning — show ~6 labels max, like web's interval logic.
  const tickStep = Math.max(1, Math.ceil(n / 6));

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {/* Legend */}
      <View style={styles.legend}>
        {Object.values(STREAMS).map((sM) => (
          <View key={sM.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: sM.color }]} />
            <Text style={styles.legendText}>{sM.label}</Text>
          </View>
        ))}
      </View>

      {width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          {/* Gridlines + $ axis labels at 0, ½, full */}
          {[0, 0.5, 1].map((f) => {
            const y = TOP_PAD + (usableH) * (1 - f);
            return (
              <G key={f}>
                <Line
                  x1={AXIS_W} y1={y} x2={width} y2={y}
                  stroke={colors.border} strokeWidth={1}
                />
                <SvgText
                  x={AXIS_W - 6} y={y + 3}
                  fontSize={9} fill={colors.textFaint}
                  textAnchor="end" fontFamily={fonts.mono}
                >
                  {money(max * f)}
                </SvgText>
              </G>
            );
          })}

          {/* Bars */}
          {data.map((d, i) => {
            const x = AXIS_W + i * slot + gap;
            const total = d.cash + d.nonCash + d.delivery;
            const segs = [
              { v: d.cash, color: STREAMS.cash.color },
              { v: d.nonCash, color: STREAMS.nonCash.color },
              { v: d.delivery, color: STREAMS.delivery.color },
            ].filter((sg) => sg.v > 0);

            let runningBottom = baseline;
            const topIdx = segs.length - 1;
            return (
              <G key={d.label + i}>
                {/* Empty-day placeholder so zero days read as "no earnings". */}
                {total === 0 && (
                  <Rect
                    x={x} y={baseline - 3} width={barW} height={3}
                    rx={1.5} fill={colors.cardAlt}
                  />
                )}
                {segs.map((sg, si) => {
                  // Floor each non-zero segment to a visible nub so a small
                  // month/day (e.g. a single $3.50 ride) still reads as a bar
                  // next to a tall one — otherwise it scales to a sub-pixel
                  // sliver and looks like "no earnings". yTop is derived from
                  // the floored height so the stack stays consistent.
                  const h = Math.max(sg.v * scale, MIN_SEG_PX);
                  const yTop = runningBottom - h;
                  runningBottom = yTop;
                  return (
                    <Segment
                      key={si}
                      x={x} width={barW} baseline={baseline}
                      yTop={yTop} height={h} color={sg.color}
                      progress={progress} roundTop={si === topIdx}
                    />
                  );
                })}
                {/* Tap target — full column, transparent. */}
                {onDrill && (
                  <Rect
                    x={AXIS_W + i * slot} y={0}
                    width={slot} height={baseline}
                    fill="transparent"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      onDrill(d, i);
                    }}
                  />
                )}
                {/* X label (thinned) */}
                {i % tickStep === 0 && (
                  <SvgText
                    x={x + barW / 2} y={CHART_HEIGHT - 4}
                    fontSize={8} fill={colors.textFaint}
                    textAnchor="middle" fontFamily={fonts.mono}
                  >
                    {d.label}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

// ── Drill sheet ─────────────────────────────────────────────────────────────
// Bottom sheet mirroring the web DrillDaySheet: the tapped bucket's total +
// per-stream split.

function useCountUp(target: number, duration = 700): string {
  const val = useRef(new RNAnimated.Value(0)).current;
  const [display, setDisplay] = useState('0.00');
  useEffect(() => {
    val.setValue(0);
    const id = val.addListener(({ value }) => setDisplay(value.toFixed(2)));
    RNAnimated.timing(val, {
      toValue: target, duration, easing: RNEasing.out(RNEasing.cubic), useNativeDriver: false,
    }).start(() => setDisplay(target.toFixed(2)));
    return () => val.removeListener(id);
  }, [target, duration, val]);
  return display;
}

export function EarningsDrillSheet({
  point, onClose,
}: {
  point: StackPoint | null;
  onClose: () => void;
}) {
  const slide = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (point) {
      slide.setValue(0);
      RNAnimated.timing(slide, {
        toValue: 1, duration: 260, easing: RNEasing.out(RNEasing.cubic), useNativeDriver: true,
      }).start();
    }
  }, [point, slide]);

  const total = point ? point.cash + point.nonCash + point.delivery : 0;
  const totalDisplay = useCountUp(total);

  if (!point) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <RNAnimated.View
          style={[styles.sheet, { opacity: slide, transform: [{ translateY }] }]}
        >
          <Pressable onPress={() => {}}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetDay}>{point.fullLabel.toUpperCase()}</Text>
                <Text style={styles.sheetTotal}>${totalDisplay}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textTertiary} />
              </Pressable>
            </View>

            {/* Per-stream split */}
            <View style={styles.splitRow}>
              <SplitCard label="Cash" value={point.cash} color={STREAMS.cash.color} />
              <SplitCard label="HMU Pay" value={point.nonCash} color={STREAMS.nonCash.color} />
              <SplitCard label="Delivery" value={point.delivery} color={STREAMS.delivery.color} />
            </View>

            {/* Counts */}
            <View style={styles.countRow}>
              <Ionicons name="car-outline" size={13} color={colors.textTertiary} />
              <Text style={styles.countText}>
                {point.rides} ride{point.rides !== 1 ? 's' : ''}
              </Text>
              {(point.jobs ?? 0) > 0 && (
                <>
                  <View style={styles.countDivider} />
                  <Ionicons name="bag-handle-outline" size={13} color={colors.textTertiary} />
                  <Text style={styles.countText}>
                    {point.jobs} deliver{(point.jobs ?? 0) !== 1 ? 'ies' : 'y'}
                  </Text>
                </>
              )}
            </View>
          </Pressable>
        </RNAnimated.View>
      </Pressable>
    </Modal>
  );
}

function SplitCard({ label, value, color }: { label: string; value: number; color: string }) {
  const display = useCountUp(value);
  return (
    <View style={styles.splitCard}>
      <Text style={[styles.splitLabel, { color }]}>{label.toUpperCase()}</Text>
      <Text style={styles.splitValue}>${display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  legend: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs, justifyContent: 'flex-end' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { fontFamily: fonts.mono, fontSize: 8, color: colors.textTertiary, letterSpacing: 0.5 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong,
    paddingBottom: spacing.xxxl,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  sheetDay: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, letterSpacing: 1 },
  sheetTotal: { fontFamily: fonts.display, fontSize: 38, color: colors.textPrimary, lineHeight: 42 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  splitRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  splitCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.cardInner, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  splitLabel: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1, marginBottom: 4 },
  splitValue: { fontFamily: fonts.display, fontSize: 20, color: colors.textPrimary, lineHeight: 22 },

  countRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countText: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  countDivider: { width: 1, height: 12, backgroundColor: colors.border, marginHorizontal: spacing.xs },
});
