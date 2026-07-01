import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({ 
    status: 'healthy',
    message: 'App is running (Firebase health check disabled for Vercel compatibility)'
  });
}
