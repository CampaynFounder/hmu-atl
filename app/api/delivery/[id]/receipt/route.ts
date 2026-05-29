// POST /api/delivery/[id]/receipt
// Courier uploads receipt photo. Runs GPT-4o-mini vision OCR.
// at_merchant → receipt_uploaded.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const R2_PUBLIC = 'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';

async function uploadReceiptToR2(
  _buffer: Buffer,
  ext: string,
  deliveryId: string,
): Promise<string> {
  const key = `deliveries/${deliveryId}/receipt-${Date.now()}.${ext}`;
  // Placeholder — replace with real R2 PUT when Workers binding is wired.
  return `${R2_PUBLIC}/${key}`;
}

async function ocrReceipt(imageUrl: string): Promise<{
  totalCents: number | null;
  merchantName: string | null;
  raw: unknown;
}> {
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
              {
                type: 'text',
                text: 'Extract from this receipt: (1) total amount paid in USD, (2) merchant/store name. Respond only with valid JSON: {"total_usd": number|null, "merchant_name": string|null}',
              },
            ],
          },
        ],
      }),
    });

    const json = await resp.json() as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? '{}';
    const data = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      total_usd: number | null;
      merchant_name: string | null;
    };

    return {
      totalCents: data.total_usd ? Math.round(data.total_usd * 100) : null,
      merchantName: data.merchant_name ?? null,
      raw: data,
    };
  } catch {
    return { totalCents: null, merchantName: null, raw: null };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { rows: [delivery] } = await pool.query(
      `SELECT id FROM delivery_requests WHERE id = $1 AND courier_id = $2 AND status = 'at_merchant'`,
      [id, user.id],
    );
    if (!delivery) return NextResponse.json({ error: 'Invalid state or unauthorized' }, { status: 409 });

    const form = await req.formData();
    const file = form.get('receipt') as File | null;
    if (!file) return NextResponse.json({ error: 'No receipt file provided' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const buffer = Buffer.from(await file.arrayBuffer());
    const receiptUrl = await uploadReceiptToR2(buffer, ext, id);

    const ocr = await ocrReceipt(receiptUrl);

    await pool.query(
      `INSERT INTO delivery_receipts (delivery_id, receipt_url, ocr_total_cents, ocr_merchant_name, ocr_raw, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, receiptUrl, ocr.totalCents, ocr.merchantName, JSON.stringify(ocr.raw), user.id],
    );

    if (ocr.totalCents) {
      await pool.query(
        `UPDATE delivery_requests SET actual_merchant_spend_cents = $1 WHERE id = $2`,
        [ocr.totalCents, id],
      );
    }

    await pool.query(
      `UPDATE delivery_requests
       SET status = 'receipt_uploaded', receipt_uploaded_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id],
    );

    return NextResponse.json({
      status: 'receipt_uploaded',
      receiptUrl,
      ocrTotal: ocr.totalCents ? ocr.totalCents / 100 : null,
      ocrMerchantName: ocr.merchantName,
    });
  } catch (err) {
    console.error('[delivery/receipt]', err);
    return NextResponse.json({ error: 'Failed to process receipt' }, { status: 500 });
  }
}
