import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  return NextResponse.json({ 
    error: 'Email service temporarily disabled during Resend migration' 
  }, { status: 503 });
}
