export const dynamic = 'force-dynamic';

const OWNER_EMAIL = 'andrewtinkler@optusnet.com.au';

// Verify Firebase ID token using REST API
async function verifyIdToken(idToken: string) {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!response.ok) {
      throw new Error('Token verification failed');
    }

    const data = await response.json();
    const user = data.users?.[0];

    if (!user) {
      throw new Error('User not found');
    }

    return { email: user.email, uid: user.localId };
  } catch (error) {
    console.error('Token verification error:', error);
    throw error;
  }
}

// Get events from Firestore REST API
async function getEventsFromFirestore(idToken: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events`,
    {
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch events');
  }

  const data = await response.json();
  const events = (data.documents || []).map((doc: any) => {
    const fields = doc.fields;

    // Helper to extract values from Firestore REST format
    const extractArray = (field: any) => field?.arrayValue?.values || [];

    return {
      id: doc.name.split('/').pop(),
      eventName: fields.eventName?.stringValue || '',
      adminEmail: fields.adminEmail?.stringValue || '',
      createdAt: fields.createdAt?.timestampValue || new Date().toISOString(),
      currentRoundId: fields.currentRoundId?.stringValue || '',
      rounds: extractArray(fields.rounds).map((r: any) => ({
        id: r.mapValue?.fields?.id?.stringValue || '',
        label: r.mapValue?.fields?.label?.stringValue || '',
      })),
      players: extractArray(fields.players).map((p: any) => ({
        id: p.mapValue?.fields?.id?.stringValue || '',
        name: p.mapValue?.fields?.name?.stringValue || '',
        handicap: p.mapValue?.fields?.handicap?.stringValue || '',
      })),
      groups: extractArray(fields.groups).map((g: any) => ({
        id: g.mapValue?.fields?.id?.stringValue || '',
        name: g.mapValue?.fields?.name?.stringValue || '',
        playerIds: extractArray(g.mapValue?.fields?.playerIds),
      })),
      competitions: extractArray(fields.competitions).map((c: any) => ({
        id: c.mapValue?.fields?.id?.stringValue || '',
        name: c.mapValue?.fields?.name?.stringValue || '',
        selected: c.mapValue?.fields?.selected?.booleanValue || false,
      })),
      matches: extractArray(fields.matches),
    };
  });

  // Sort by creation date (newest first)
  return events.sort((a: any, b: any) => {
    const aDate = new Date(a.createdAt).getTime();
    const bDate = new Date(b.createdAt).getTime();
    return bDate - aDate;
  });
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify token
    const user = await verifyIdToken(idToken);

    // Check if user is owner
    if (user.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      return Response.json({
        error: 'Access denied',
        message: `Owner dashboard requires login as ${OWNER_EMAIL}`,
        currentUser: user.email,
      }, { status: 403 });
    }

    // Get events from Firestore
    const events = await getEventsFromFirestore(idToken);

    return Response.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
