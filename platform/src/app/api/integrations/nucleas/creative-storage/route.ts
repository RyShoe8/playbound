import { NextResponse } from 'next/server';
import { verifyRoundupRequest } from '@/lib/nucleasRoundup';
import { nucleasCreativeAction } from '@/lib/nucleasCreativeStorage';
export const maxDuration = 60;
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.NUCLEAS_ROUNDUP_SECRET;
  if (!secret || raw.length > 4096 || !verifyRoundupRequest(request, raw, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid input');
    const result = await nucleasCreativeAction(input);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Creative storage request failed. Check game-storage access and the requested scope.' }, { status: 422 });
  }
}
