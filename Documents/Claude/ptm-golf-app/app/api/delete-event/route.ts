export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await request.json();

    if (!eventId) {
      return Response.json({ error: 'eventId is required' }, { status: 400 });
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    // Delete event document
    const deleteEventResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!deleteEventResponse.ok) {
      const errorData = await deleteEventResponse.json().catch(() => ({}));
      console.error('Firestore delete error:', { status: deleteEventResponse.status, error: errorData });

      if (deleteEventResponse.status === 401) {
        return Response.json({ error: 'Unauthorized - please log in again' }, { status: 401 });
      }
      if (deleteEventResponse.status === 403) {
        return Response.json({ error: 'Access denied - only owner and admin can delete events' }, { status: 403 });
      }
      if (deleteEventResponse.status === 404) {
        return Response.json({ error: 'Event not found' }, { status: 404 });
      }

      throw new Error(`Firestore error: ${deleteEventResponse.status} ${deleteEventResponse.statusText}`);
    }

    // Clean up related collections (scores, games, signatures that reference this event)
    const collectionsToClean = ['scores', 'games', 'signatures'];
    const cleanupResults = {};

    for (const collection of collectionsToClean) {
      try {
        // Query documents with eventId field matching this event
        const queryResponse = await fetch(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}?pageSize=1000`,
          {
            headers: { 'Authorization': `Bearer ${idToken}` },
          }
        );

        if (queryResponse.ok) {
          const queryData = await queryResponse.json();
          const docs = queryData.documents || [];
          let deletedCount = 0;

          // Delete documents that reference this event
          for (const doc of docs) {
            const fields = doc.fields;
            const docEventId = fields.eventId?.stringValue;

            if (docEventId === eventId) {
              const deleteResponse = await fetch(doc.name, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${idToken}` },
              });
              if (deleteResponse.ok) {
                deletedCount++;
              } else {
                console.warn(`Failed to delete ${doc.name}: ${deleteResponse.status}`);
              }
            }
          }
          cleanupResults[collection] = deletedCount;
        }
      } catch (err) {
        console.warn(`Error cleaning up ${collection}:`, err);
        cleanupResults[collection] = 'error';
        // Continue with other collections even if one fails
      }
    }

    console.log(`Event ${eventId} deleted with cleanup results:`, cleanupResults);
    return Response.json({ success: true, message: `Event ${eventId} and all related data deleted successfully`, cleanupResults }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Delete event error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to delete event' },
      { status: 500 }
    );
  }
}
