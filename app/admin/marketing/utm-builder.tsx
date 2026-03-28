'use client';

import { useState } from 'react';

interface UtmBuilderProps {
  onInsert: (url: string) => void;
}

const DOMAINS = [
  { label: 'atl.hmucashride.com', value: 'atl.hmucashride.com' },
  { label: 'hmucashride.com', value: 'hmucashride.com' },
];

const PATHS = [
  { label: '/ (Home)', value: '/' },
  { label: '/driver (Driver Landing)', value: '/driver' },
  { label: '/rider (Rider Landing)', value: '/rider' },
  { label: '/sign-up (Sign Up)', value: '/sign-up' },
  { label: '/pricing (Pricing)', value: '/pricing' },
  { label: '/safety (Safety)', value: '/safety' },
];

const UTM_SOURCES = [
  'sms', 'facebook', 'instagram', 'tiktok', 'twitter', 'flyer', 'referral', 'direct', 'email',
];

const UTM_MEDIUMS = [
  'sms', 'social', 'organic', 'paid', 'referral', 'flyer', 'qr', 'email',
];

const UTM_CAMPAIGNS = [
  'driver_recruitment', 'rider_acquisition', 'launch_atl', 'no_show_pain',
  'safety_messaging', 'fee_comparison', 'upfront_pay', 'reactivation',
  'referral_push', 'weekend_promo',
];

export function UtmBuilder({ onInsert }: UtmBuilderProps) {
  const [domain, setDomain] = useState(DOMAINS[0].value);
  const [path, setPath] = useState('/');
  const [customPath, setCustomPath] = useState('');
  const [utmSource, setUtmSource] = useState('sms');
  const [utmMedium, setUtmMedium] = useState('sms');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [utmTerm, setUtmTerm] = useState('');
  const [customSource, setCustomSource] = useState('');
  const [customMedium, setCustomMedium] = useState('');
  const [customCampaign, setCustomCampaign] = useState('');
  const [copied, setCopied] = useState(false);

  const finalPath = path === 'custom' ? customPath : path;
  const finalSource = utmSource === 'custom' ? customSource : utmSource;
  const finalMedium = utmMedium === 'custom' ? customMedium : utmMedium;
  const finalCampaign = utmCampaign === 'custom' ? customCampaign : utmCampaign;

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (finalSource) params.set('utm_source', finalSource);
    if (finalMedium) params.set('utm_medium', finalMedium);
    if (finalCampaign) params.set('utm_campaign', finalCampaign);
    if (utmContent) params.set('utm_content', utmContent);
    if (utmTerm) params.set('utm_term', utmTerm);

    const qs = params.toString();
    const base = `https://${domain}${finalPath}`;
    return qs ? `${base}?${qs}` : base;
  };

  const url = buildUrl();

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = () => {
    onInsert(url);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-4">UTM Link Builder</h3>

      <div className="space-y-3">
        {/* Domain */}
        <div>
          <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">Domain</label>
          <div className="flex gap-2">
            {DOMAINS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDomain(d.value)}
                className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors ${
                  domain === d.value
                    ? 'bg-white text-black font-medium'
                    : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Path */}
        <div>
          <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">Page</label>
          <select
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {PATHS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
            <option value="custom">Custom path...</option>
          </select>
          {path === 'custom' && (
            <input
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="/your/path"
              className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
          )}
        </div>

        {/* UTM Source */}
        <div>
          <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">utm_source</label>
          <select
            value={utmSource}
            onChange={(e) => setUtmSource(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {UTM_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="custom">Custom...</option>
          </select>
          {utmSource === 'custom' && (
            <input
              type="text"
              value={customSource}
              onChange={(e) => setCustomSource(e.target.value)}
              placeholder="your_source"
              className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
          )}
        </div>

        {/* UTM Medium */}
        <div>
          <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">utm_medium</label>
          <select
            value={utmMedium}
            onChange={(e) => setUtmMedium(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {UTM_MEDIUMS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="custom">Custom...</option>
          </select>
          {utmMedium === 'custom' && (
            <input
              type="text"
              value={customMedium}
              onChange={(e) => setCustomMedium(e.target.value)}
              placeholder="your_medium"
              className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
          )}
        </div>

        {/* UTM Campaign */}
        <div>
          <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">utm_campaign</label>
          <select
            value={utmCampaign}
            onChange={(e) => setUtmCampaign(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">None</option>
            {UTM_CAMPAIGNS.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
            <option value="custom">Custom...</option>
          </select>
          {utmCampaign === 'custom' && (
            <input
              type="text"
              value={customCampaign}
              onChange={(e) => setCustomCampaign(e.target.value)}
              placeholder="your_campaign"
              className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
          )}
        </div>

        {/* UTM Content (optional) */}
        <div>
          <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">utm_content <span className="text-neutral-600">(optional)</span></label>
          <input
            type="text"
            value={utmContent}
            onChange={(e) => setUtmContent(e.target.value)}
            placeholder="e.g. cta_button, hero_link, template_a"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
          />
        </div>

        {/* UTM Term (optional) */}
        <div>
          <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">utm_term <span className="text-neutral-600">(optional)</span></label>
          <input
            type="text"
            value={utmTerm}
            onChange={(e) => setUtmTerm(e.target.value)}
            placeholder="e.g. cash_ride, no_show, upfront_pay"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600"
          />
        </div>
      </div>

      {/* Generated URL */}
      <div className="mt-4 pt-4 border-t border-neutral-800">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wide block mb-1">Generated Link</label>
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-xs font-mono text-green-400 break-all select-all">
          {url}
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleInsert}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            Insert into Message
          </button>
          <button
            onClick={handleCopy}
            className="bg-neutral-800 border border-neutral-700 hover:border-neutral-500 text-neutral-300 text-xs font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
