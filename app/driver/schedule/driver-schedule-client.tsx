'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAbly } from '@/hooks/use-ably';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6am - 11pm

const COLORS = {
  green: '#00E676', black: '#080808', card: '#141414', card2: '#1a1a1a',
  white: '#fff', gray: '#888', grayLight: '#bbb', red: '#FF5252',
  orange: '#FF9100', blue: '#448AFF', yellow: '#FFC107',
};
const FONTS = {
  display: "var(--font-display, 'Bebas Neue', sans-serif)",
  body: "var(--font-body, 'DM Sans', sans-serif)",
  mono: "var(--font-mono, 'Space Mono', monospace)",
};

interface ScheduleDay {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface Booking {
  id: string;
  bookingType: string;
  startAt: string;
  endAt: string;
  status: string;
  title: string | null;
  riderName: string | null;
  riderHandle: string | null;
  rideId: string | null;
}

interface Props {
  userId: string;
  timezone: string;
  marketName: string;
}

export default function DriverScheduleClient({ userId, timezone, marketName }: Props) {
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [hoursDraft, setHoursDraft] = useState<{ dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }[]>([]);
  const [blockingTime, setBlockingTime] = useState(false);
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockTitle, setBlockTitle] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekStart = getWeekStart(weekOffset);
  const weekLabel = formatWeekLabel(weekStart);

  const fetchSchedule = useCallback(async () => {
    const weekOf = weekStart.toISOString().split('T')[0];
    try {
      const res = await fetch(`/api/driver/schedule?weekOf=${weekOf}`);
      if (res.ok) {
        const data = await res.json();
        setSchedule(data.schedule || []);
        setBookings(data.bookings || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  // Ably real-time updates
  useAbly({
    channelName: `user:${userId}:notify`,
    onMessage: useCallback((msg: { name: string }) => {
      if (['booking_accepted', 'booking_cancelled', 'ride_update'].includes(msg.name)) {
        fetchSchedule();
      }
    }, [fetchSchedule]),
  });

  // Open hours editor with current values
  const openHoursEditor = () => {
    const draft = DAYS.map((_, i) => {
      const existing = schedule.find(s => s.dayOfWeek === i);
      return {
        dayOfWeek: i,
        startTime: existing?.startTime?.slice(0, 5) || '09:00',
        endTime: existing?.endTime?.slice(0, 5) || '17:00',
        isActive: existing?.isActive ?? (i >= 1 && i <= 5), // default Mon-Fri
      };
    });
    setHoursDraft(draft);
    setEditingHours(true);
  };

  const saveHours = async () => {
    setSaving(true);
    try {
      await fetch('/api/driver/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: hoursDraft }),
      });
      setEditingHours(false);
      fetchSchedule();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleBlockTime = async () => {
    if (!blockStart || !blockEnd) return;
    setSaving(true);
    try {
      const res = await fetch('/api/driver/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'block', startAt: blockStart, endAt: blockEnd, title: blockTitle || 'Blocked' }),
      });
      const data = await res.json();
      if (res.ok) {
        setBlockingTime(false);
        setBlockStart('');
        setBlockEnd('');
        setBlockTitle('');
        fetchSchedule();
      } else {
        alert(data.error || 'Failed to block time');
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleUnblock = async (bookingId: string) => {
    await fetch('/api/driver/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unblock', bookingId }),
    });
    fetchSchedule();
  };

  // Get working hours for a specific day
  const getHoursForDay = (dayOfWeek: number) => schedule.find(s => s.dayOfWeek === dayOfWeek && s.isActive);

  // Get bookings for a specific day
  const getBookingsForDay = (date: Date) => {
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
    return bookings.filter(b => {
      const bStart = new Date(b.startAt);
      const bEnd = new Date(b.endAt);
      return bStart < dayEnd && bEnd > dayStart;
    });
  };

  return (
    <div style={{ background: COLORS.black, minHeight: '100svh', color: COLORS.white, fontFamily: FONTS.body, paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/driver/home" style={{ color: COLORS.green, display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Home
        </Link>
      </div>

      <div style={{ padding: '12px 20px 16px' }}>
        <div style={{ fontFamily: FONTS.display, fontSize: 32, lineHeight: 1 }}>Schedule</div>
        <div style={{ fontSize: 12, color: COLORS.gray, marginTop: 4 }}>{marketName} · {timezone.split('/')[1]?.replace('_', ' ')}</div>
      </div>

      {/* Week Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 12px' }}>
        <button onClick={() => setWeekOffset(o => o - 1)} style={{ background: 'none', border: 'none', color: COLORS.grayLight, cursor: 'pointer', padding: 8 }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{weekLabel}</div>
        <button onClick={() => setWeekOffset(o => o + 1)} style={{ background: 'none', border: 'none', color: COLORS.grayLight, cursor: 'pointer', padding: 8 }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px' }}>
        <button onClick={openHoursEditor} style={{
          flex: 1, padding: '10px 14px', borderRadius: 100, fontSize: 13, fontWeight: 600,
          background: schedule.length > 0 ? 'rgba(0,230,118,0.08)' : COLORS.green,
          color: schedule.length > 0 ? COLORS.green : COLORS.black,
          border: `1px solid ${COLORS.green}33`, cursor: 'pointer', fontFamily: FONTS.body,
        }}>
          {schedule.length > 0 ? 'Edit Hours' : 'Set Working Hours'}
        </button>
        <button onClick={() => setBlockingTime(!blockingTime)} style={{
          flex: 1, padding: '10px 14px', borderRadius: 100, fontSize: 13, fontWeight: 600,
          background: 'transparent', color: COLORS.grayLight,
          border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontFamily: FONTS.body,
        }}>
          Block Time
        </button>
      </div>

      {/* Block time form */}
      {blockingTime && (
        <div style={{ margin: '0 20px 16px', background: COLORS.card, borderRadius: 16, padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.white, marginBottom: 10 }}>Block Time Off</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="datetime-local" value={blockStart} onChange={e => setBlockStart(e.target.value)}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 13 }} />
            <input type="datetime-local" value={blockEnd} onChange={e => setBlockEnd(e.target.value)}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 13 }} />
          </div>
          <input type="text" placeholder="Reason (optional)" value={blockTitle} onChange={e => setBlockTitle(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 13, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setBlockingTime(false)} style={{ flex: 1, padding: 10, borderRadius: 100, border: '1px solid #333', background: 'transparent', color: COLORS.gray, fontSize: 13, cursor: 'pointer', fontFamily: FONTS.body }}>Cancel</button>
            <button onClick={handleBlockTime} disabled={saving} style={{ flex: 1, padding: 10, borderRadius: 100, border: 'none', background: COLORS.red, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONTS.body, opacity: saving ? 0.5 : 1 }}>Block</button>
          </div>
        </div>
      )}

      {/* Hours editor sheet */}
      {editingHours && (
        <div style={{ margin: '0 20px 16px', background: COLORS.card, borderRadius: 16, padding: '16px', border: '1px solid rgba(0,230,118,0.15)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.green, marginBottom: 12 }}>Working Hours</div>
          {hoursDraft.map((day, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => {
                  const updated = [...hoursDraft];
                  updated[i].isActive = !updated[i].isActive;
                  setHoursDraft(updated);
                }}
                style={{
                  width: 44, fontSize: 12, fontWeight: 700, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: day.isActive ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.05)',
                  color: day.isActive ? COLORS.green : COLORS.gray, fontFamily: FONTS.mono,
                }}
              >{DAYS[i]}</button>
              {day.isActive ? (
                <>
                  <input type="time" value={day.startTime}
                    onChange={e => { const u = [...hoursDraft]; u[i].startTime = e.target.value; setHoursDraft(u); }}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 13 }} />
                  <span style={{ fontSize: 12, color: COLORS.gray }}>to</span>
                  <input type="time" value={day.endTime}
                    onChange={e => { const u = [...hoursDraft]; u[i].endTime = e.target.value; setHoursDraft(u); }}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 13 }} />
                </>
              ) : (
                <span style={{ flex: 1, fontSize: 12, color: COLORS.gray, paddingLeft: 8 }}>Off</span>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setEditingHours(false)} style={{ flex: 1, padding: 10, borderRadius: 100, border: '1px solid #333', background: 'transparent', color: COLORS.gray, fontSize: 13, cursor: 'pointer', fontFamily: FONTS.body }}>Cancel</button>
            <button onClick={saveHours} disabled={saving} style={{ flex: 1, padding: 10, borderRadius: 100, border: 'none', background: COLORS.green, color: COLORS.black, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONTS.body, opacity: saving ? 0.5 : 1 }}>Save Hours</button>
          </div>
        </div>
      )}

      {/* Week Calendar Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: COLORS.gray }}>Loading schedule...</div>
      ) : (
        <div ref={scrollRef} style={{ padding: '0 12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', minWidth: 700, gap: 1 }}>
            {/* Day headers */}
            <div />
            {DAYS.map((day, i) => {
              const date = new Date(weekStart);
              date.setDate(date.getDate() + i);
              const isToday = date.toDateString() === new Date().toDateString();
              const hours = getHoursForDay(i);
              return (
                <div key={i} style={{
                  textAlign: 'center', padding: '8px 4px', fontSize: 11, fontWeight: 700,
                  color: isToday ? COLORS.green : COLORS.grayLight,
                  borderBottom: isToday ? `2px solid ${COLORS.green}` : '1px solid rgba(255,255,255,0.06)',
                  fontFamily: FONTS.mono,
                }}>
                  <div>{day}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isToday ? COLORS.green : COLORS.white }}>{date.getDate()}</div>
                  {hours && <div style={{ fontSize: 9, color: COLORS.gray, marginTop: 2 }}>{hours.startTime.slice(0, 5)}-{hours.endTime.slice(0, 5)}</div>}
                </div>
              );
            })}

            {/* Time rows */}
            {HOURS.map(hour => (
              <>
                {/* Time label */}
                <div key={`label-${hour}`} style={{
                  fontSize: 10, color: COLORS.gray, textAlign: 'right', paddingRight: 6, paddingTop: 2,
                  fontFamily: FONTS.mono, height: 48, borderTop: '1px solid rgba(255,255,255,0.03)',
                }}>
                  {hour > 12 ? `${hour - 12}p` : hour === 12 ? '12p' : `${hour}a`}
                </div>

                {/* Day cells */}
                {DAYS.map((_, dayIdx) => {
                  const date = new Date(weekStart);
                  date.setDate(date.getDate() + dayIdx);
                  const cellStart = new Date(date);
                  cellStart.setHours(hour, 0, 0, 0);

                  const hours = getHoursForDay(dayIdx);
                  const isWorking = hours && hour >= parseInt(hours.startTime) && hour < parseInt(hours.endTime);
                  const dayBookings = getBookingsForDay(date).filter(b => {
                    const bHour = new Date(b.startAt).getHours();
                    const bEndHour = new Date(b.endAt).getHours();
                    return (bHour <= hour && bEndHour > hour) || bHour === hour;
                  });

                  return (
                    <div key={`${dayIdx}-${hour}`} style={{
                      height: 48, borderTop: '1px solid rgba(255,255,255,0.03)',
                      borderLeft: '1px solid rgba(255,255,255,0.03)',
                      background: isWorking ? 'rgba(0,230,118,0.04)' : 'transparent',
                      position: 'relative', overflow: 'hidden',
                    }}>
                      {dayBookings.map(b => (
                        <div
                          key={b.id}
                          onClick={() => {
                            if (b.bookingType === 'blocked' && confirm('Remove this block?')) handleUnblock(b.id);
                            if (b.rideId) window.location.href = `/ride/${b.rideId}`;
                          }}
                          style={{
                            position: 'absolute', top: 1, left: 1, right: 1, bottom: 1, borderRadius: 6,
                            padding: '2px 4px', fontSize: 9, fontWeight: 600, cursor: 'pointer',
                            overflow: 'hidden', lineHeight: 1.3,
                            background: b.bookingType === 'blocked' ? 'rgba(255,82,82,0.15)' :
                              b.bookingType === 'ride' ? 'rgba(68,138,255,0.2)' : 'rgba(255,145,0,0.15)',
                            color: b.bookingType === 'blocked' ? COLORS.red :
                              b.bookingType === 'ride' ? COLORS.blue : COLORS.orange,
                            border: `1px solid ${b.bookingType === 'blocked' ? 'rgba(255,82,82,0.3)' :
                              b.bookingType === 'ride' ? 'rgba(68,138,255,0.3)' : 'rgba(255,145,0,0.3)'}`,
                          }}
                        >
                          {b.riderName || b.title || b.bookingType}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '16px 20px', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: COLORS.gray }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(0,230,118,0.15)' }} /> Working
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: COLORS.gray }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(68,138,255,0.3)' }} /> Booked
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: COLORS.gray }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,82,82,0.2)' }} /> Blocked
        </div>
      </div>
    </div>
  );
}

function getWeekStart(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + (offset * 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${weekStart.toLocaleDateString('en-US', opts)} — ${end.toLocaleDateString('en-US', opts)}`;
}
