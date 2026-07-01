import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  return NextResponse.json({ 
    error: 'This endpoint requires migration to Firestore REST API and is temporarily disabled' 
  }, { status: 503 });
}
