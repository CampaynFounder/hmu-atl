import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate } from '@/lib/ably/server';
import { sendSms } from '@/lib/sms/textbee';

// Quick message definitions — keyed by role + shortcode
const QUICK_MESSAGES: Record<string, {
  display: string;
  smsTemplate: (senderName: string, rideId: string, extra?: string) => string;
  roles: ('rider' | 'driver')[];
  statuses: string[];
}> = {
  'rider_eta': {
    display: 'ETA?',
    smsTemplate: (name, id) => `HMU ATL: ${name} wants your ETA. Open HMU: atl.hmucashride.com/ride/${id}`,
    roles: ['rider'],
    statuses: ['otw', 'here', 'confirming'],
  },
  'rider_wya': {
    display: 'WYA?',
    smsTemplate: (name, id) => `HMU ATL: ${name}: Where you at? atl.hmucashride.com/ride/${id}`,
    roles: ['rider'],
    statuses: ['otw', 'here', 'confirming'],
  },
  'rider_here': {
    display: "I'm here",
    smsTemplate: (name, id) => `HMU ATL: ${name} is at the pickup spot. atl.hmucashride.com/ride/${id}`,
    roles: ['rider'],
    statuses: ['otw', 'here', 'confirming'],
  },
  'rider_late': {
    display: 'Running late',
    smsTemplate: (name) => `HMU ATL: ${name} is running a few min late — sit tight`,
    roles: ['rider'],
    statuses: ['otw', 'here', 'confirming'],
  },
  'rider_spot': {
    display: '📍 Share my spot',
    smsTemplate: (name, _id, extra) => `HMU ATL: ${name} shared their location: ${extra || 'Check the app'}`,
    roles: ['rider'],
    statuses: ['otw', 'here', 'confirming'],
  },
  'driver_otw': {
    display: 'OTW',
    smsTemplate: (name, id) => `HMU ATL: ${name} is on the way! Track ETA: atl.hmucashride.com/ride/${id}`,
    roles: ['driver'],
    statuses: ['otw'],
  },
  'driver_5min': {
    display: '5 min away',
    smsTemplate: (name) => `HMU ATL: ${name} is about 5 min away — head to the pickup spot!`,
    roles: ['driver'],
    statuses: ['otw'],
  },
  'driver_here': {
    display: "I'm here",
    smsTemplate: (name, id) => `HMU ATL: ${name} is HERE! Head to the car. atl.hmucashride.com/ride/${id}`,
    roles: ['driver'],
    statuses: ['here', 'confirming'],
  },
  'driver_cantfind': {
    display: "Can't find you",
    smsTemplate: (name, id) => `HMU ATL: ${name} can't find you at the pickup. Open HMU and share your spot: atl.hmucashride.com/ride/${id}`,
    roles: ['driver'],
    statuses: ['here', 'confirming'],
  },
  'driver_pulling_up': {
    display: 'Pulling up now',
    smsTemplate: (name) => `HMU ATL: ${name} is pulling up now — be ready!`,
    roles: ['driver'],
    statuses: ['otw', 'here'],
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT driver_id, rider_id, status FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.driver_id !== userId && ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Not part of this ride' }, { status: 403 });
    }

    const messages = await sql`
      SELECT rm.id, rm.sender_id, rm.content, rm.created_at, rm.message_type, rm.quick_key
      FROM ride_messages rm
      WHERE rm.ride_id = ${rideId}
      ORDER BY rm.created_at ASC
      LIMIT 100
    `;

    return NextResponse.json({
      messages: messages.map((m: Record<string, unknown>) => ({
        id: m.id,
        senderId: m.sender_id,
        content: m.content,
        createdAt: m.created_at,
        type: m.message_type || 'chat',
        quickKey: m.quick_key || null,
      })),
    });
  } catch (error) {
    console.error('Chat GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json();
    const content = (body.content || '').trim();
    const quickKey = body.quickKey as string | undefined;
    const extraData = body.extraData as string | undefined; // for location sharing etc

    if (!content || content.length > 500) {
      return NextResponse.json({ error: 'Message must be 1-500 characters' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT driver_id, rider_id, status FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.driver_id !== userId && ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Not part of this ride' }, { status: 403 });
    }

    const chatStatuses = ['otw', 'here', 'confirming', 'active', 'ended'];
    if (!chatStatuses.includes(ride.status as string)) {
      return NextResponse.json({ error: 'Chat not available in this ride status' }, { status: 400 });
    }

    const isDriver = ride.driver_id === userId;
    const messageType = quickKey ? 'quick' : 'chat';

    // Insert message
    const rows = await sql`
      INSERT INTO ride_messages (ride_id, sender_id, content, message_type, quick_key)
      VALUES (${rideId}, ${userId}, ${content}, ${messageType}, ${quickKey || null})
      RETURNING id, created_at
    `;
    const msg = rows[0] as { id: string; created_at: string };

    // Publish to Ably
    publishRideUpdate(rideId, 'chat_message', {
      id: msg.id,
      senderId: userId,
      content,
      createdAt: msg.created_at,
      type: messageType,
      quickKey: quickKey || null,
    }).catch(() => {});

    // SMS bridge for quick messages — 1 SMS per quickKey per ride
    let smsSent = false;
    if (quickKey && QUICK_MESSAGES[quickKey]) {
      const qm = QUICK_MESSAGES[quickKey];
      const role = isDriver ? 'driver' : 'rider';

      if (qm.roles.includes(role) && qm.statuses.includes(ride.status as string)) {
        // Check if we already SMS'd this quick message for this ride
        const existingRows = await sql`
          SELECT id FROM ride_messages
          WHERE ride_id = ${rideId} AND quick_key = ${quickKey} AND sms_sent = true
          LIMIT 1
        `;

        if (!existingRows.length) {
          // Get recipient phone + sender name
          const recipientId = isDriver ? ride.rider_id : ride.driver_id;
          const [recipientRows, senderRows] = await Promise.all([
            isDriver
              ? sql`SELECT phone FROM rider_profiles WHERE user_id = ${recipientId} LIMIT 1`
              : sql`SELECT phone FROM driver_profiles WHERE user_id = ${recipientId} LIMIT 1`,
            isDriver
              ? sql`SELECT display_name FROM driver_profiles WHERE user_id = ${userId} LIMIT 1`
              : sql`SELECT display_name FROM rider_profiles WHERE user_id = ${userId} LIMIT 1`,
          ]);

          const recipientPhone = (recipientRows[0] as Record<string, unknown>)?.phone as string;
          const senderName = (senderRows[0] as Record<string, unknown>)?.display_name as string || (isDriver ? 'Your driver' : 'Your rider');

          if (recipientPhone) {
            const smsText = qm.smsTemplate(senderName, rideId, extraData);
            sendSms(recipientPhone, smsText, {
              rideId,
              userId,
              eventType: `quick_${quickKey}`,
            }).catch(() => {});

            // Mark as sent
            await sql`UPDATE ride_messages SET sms_sent = true WHERE id = ${msg.id}`;
            smsSent = true;
          }
        }
      }
    }

    return NextResponse.json({
      id: msg.id,
      senderId: userId,
      content,
      createdAt: msg.created_at,
      type: messageType,
      quickKey: quickKey || null,
      smsSent,
    }, { status: 201 });
  } catch (error) {
    console.error('Chat POST error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
