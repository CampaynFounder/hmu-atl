export default function LegacyFullFareInfo() {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-[11px] text-neutral-400 leading-relaxed">
      <div className="text-neutral-300 font-semibold mb-1">No mode-level config.</div>
      Legacy full-fare reads from the existing <span className="font-mono">Pricing Config</span> and{' '}
      <span className="font-mono">Hold &amp; Cancellation Policy</span> sections lower on this page.
      Edit those to tune progressive tier fees, daily/weekly caps, and hold percentages.
    </div>
  );
}
