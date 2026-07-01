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

  // First, list all event documents
  const listResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events?pageSize=100`,
    {
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    }
  );

  if (!listResponse.ok) {
    throw new Error('Failed to fetch events');
  }

  const listData = await listResponse.json();
  const eventDocs = listData.documents || [];

  // For each event, fetch the full document to get all nested fields
  const events = [];
  for (const doc of eventDocs) {
    const eventId = doc.name.split('/').pop();

    // Fetch the full document directly
    const fullDocResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events/${eventId}`,
      {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      }
    );

    if (!fullDocResponse.ok) {
      console.warn(`Failed to fetch full document for event ${eventId}`);
      continue;
    }

    const fullDoc = await fullDocResponse.json();
    const fields = fullDoc.fields;

    // Log what we're getting from Firestore for debugging
    console.error('Firestore fields for event', eventId, {
      hasGroups: !!fields.groups,
      groupsValue: fields.groups,
      hasCompetitions: !!fields.competitions,
      competitionsValue: fields.competitions,
      hasMatches: !!fields.matches,
      matchesValue: fields.matches,
    });

    // Helper to extract values from Firestore REST format
    const extractArray = (field: any) => field?.arrayValue?.values || [];

    events.push({
      id: eventId,
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
        handicapIndex: p.mapValue?.fields?.handicapIndex?.stringValue || '',
      })).filter((p: any) => p.id || p.name),
      groups: (() => {
        const currentRoundId = fields.currentRoundId?.stringValue;
        const rounds = extractArray(fields.rounds);
        const currentRound = rounds.find((r: any) => r.mapValue?.fields?.id?.stringValue === currentRoundId);
        if (!currentRound) return [];
        return extractArray(currentRound.mapValue?.fields?.groups).map((g: any) => {
          const groupFields = g.mapValue?.fields || {};
          return {
            id: groupFields.id?.stringValue || '',
            name: groupFields.name?.stringValue || '',
            playerIds: extractArray(groupFields.playerIds).map((pid: any) => pid.stringValue).filter(Boolean),
          };
        }).filter((g: any) => g.id || g.name);
      })(),
      competitions: (() => {
        const currentRoundId = fields.currentRoundId?.stringValue;
        const rounds = extractArray(fields.rounds);
        const currentRound = rounds.find((r: any) => r.mapValue?.fields?.id?.stringValue === currentRoundId);
        if (!currentRound) return [];
        return extractArray(currentRound.mapValue?.fields?.competitions).map((c: any) => {
          if (typeof c.stringValue === 'string') {
            return { id: c.stringValue, name: c.stringValue, selected: true };
          }
          const compFields = c.mapValue?.fields || {};
          return {
            id: compFields.id?.stringValue || '',
            name: compFields.name?.stringValue || '',
            selected: compFields.selected?.booleanValue || true,
          };
        }).filter((c: any) => c.id || c.name);
      })(),
      matches: extractArray(fields.matches).map((m: any) => ({
        id: m.mapValue?.fields?.id?.stringValue || '',
        name: m.mapValue?.fields?.name?.stringValue || '',
      })).filter((m: any) => m.id || m.name), // Only include valid matches
    });
  }

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

    return Response.json({ events }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Get events error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
