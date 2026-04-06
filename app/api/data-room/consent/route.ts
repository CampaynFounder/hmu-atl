import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

const ACCESS_CODE = process.env.DATA_ROOM_ACCESS_CODE || 'atlhmu82';

export async function POST(request: NextRequest) {
  try {
    const { fullName, email, phone, company, title, accessCode, ndaVersion } = await request.json();

    if (!accessCode || accessCode.toLowerCase() !== ACCESS_CODE.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid access code' }, { status: 401 });
    }

    if (!fullName || !email || !phone) {
      return NextResponse.json({ error: 'Name, email, and phone are required' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (!(phoneDigits.length === 10 || (phoneDigits.length === 11 && phoneDigits.startsWith('1')))) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit US phone number' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const result = await sql`
      INSERT INTO data_room_consents (
        full_name, email, phone, company, title,
        ip_address, user_agent, access_code_used, nda_version
      ) VALUES (
        ${fullName}, ${email}, ${phone || null}, ${company || null}, ${title || null},
        ${ip}, ${userAgent}, ${accessCode}, ${ndaVersion || '1.0'}
      )
      RETURNING id, consented_at
    `;

    return NextResponse.json({
      consentId: result[0].id,
      consentedAt: result[0].consented_at,
    });
  } catch (error) {
    console.error('Data room consent error:', error);
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
  }
}
