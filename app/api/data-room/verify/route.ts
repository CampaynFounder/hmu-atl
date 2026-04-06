import { NextRequest, NextResponse } from 'next/server';

const ACCESS_CODE = process.env.DATA_ROOM_ACCESS_CODE || 'atlhmu82';

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code || code.toLowerCase() !== ACCESS_CODE.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid access code' }, { status: 401 });
    }

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
