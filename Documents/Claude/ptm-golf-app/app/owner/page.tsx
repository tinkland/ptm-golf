'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../auth-provider';
import { ChevronLeft, RefreshCw, ChevronRight, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const COLORS = {
  green: "#1F3D2B",
  greenLight: "#3A6B4A",
  greenPale: "#E9EFE5",
  cream: "#F6F1E4",
  charcoal: "#2A2622",
  gold: "#C7972F",
  goldPale: "#F2E3BC",
  flag: "#B5432D",
  flagPale: "#F1DCD3",
  line: "#D8CFB8",
};

const OWNER_EMAIL = 'andrewtinkler@optusnet.com.au';

export default function OwnerDashboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressingEventId, setProgressingEventId] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);

  // Check if user is owner
  const isOwner = user?.email === OWNER_EMAIL;

  useEffect(() => {
    if (!isOwner) {
      setError('Access denied. Owner login required.');
      setLoading(false);
      return;
    }

    fetchEvents();
  }, [isOwner, user?.uid]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error('Not authenticated');
      }

      const idToken = await user.getIdToken();

      const response = await fetch('/api/owner/events', {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load events');
      }

      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  };

  const progressEvent = async (eventId: string) => {
    try {
      setProgressingEventId(eventId);
      setProgressError(null);

      if (!user) {
        throw new Error('Not authenticated');
      }

      const idToken = await user.getIdToken();

      const response = await fetch('/api/owner/progress-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ eventId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to progress event');
      }

      // Refresh events
      await fetchEvents();
      alert('✅ Event progressed to next round!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setProgressError(message);
      console.error('Failed to progress event:', err);
    } finally {
      setProgressingEventId(null);
    }
  };

  if (!isOwner) {
    return (
      <div style={{ backgroundColor: COLORS.cream, minHeight: '100vh' }} className="flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div style={{ color: COLORS.flag }} className="mb-4">
            <AlertCircle size={48} className="mx-auto" />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: COLORS.green }}>Access Denied</h1>
          <p className="mb-6" style={{ color: COLORS.charcoal, opacity: 0.7 }}>
            This dashboard is only accessible to the platform owner.
          </p>
          <p className="text-sm" style={{ color: COLORS.charcoal, opacity: 0.5 }}>
            Current user: {user?.email || 'Not logged in'}
          </p>
          <Link href="/" className="inline-block mt-6 px-6 py-2 rounded-lg font-medium text-white" style={{ backgroundColor: COLORS.green }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: COLORS.cream, minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4" style={{ backgroundColor: 'white', borderBottom: `1px solid ${COLORS.line}` }}>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: COLORS.green }}>🏌️ Owner Dashboard</h1>
          <p className="text-xs mt-1" style={{ color: COLORS.charcoal, opacity: 0.6 }}>Central event management</p>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="p-2 rounded-lg hover:opacity-70"
          style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
          title="Refresh events"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: COLORS.flagPale, color: COLORS.flag }}>
            <p className="font-medium mb-1">⚠️ Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <p style={{ color: COLORS.charcoal, opacity: 0.6 }}>Loading events...</p>
          </div>
        )}

        {/* Events List */}
        {!loading && events.length > 0 && (
          <div className="space-y-4">
            {events.map((event) => {
              const currentRoundIdx = event.rounds.findIndex((r: any) => r.id === event.currentRoundId) || 0;
              const currentRound = event.rounds[currentRoundIdx];
              const nextRound = event.rounds[currentRoundIdx + 1];
              const isLastRound = !nextRound;

              return (
                <div
                  key={event.id}
                  className="rounded-xl p-4 border"
                  style={{ backgroundColor: 'white', borderColor: COLORS.line }}
                >
                  {/* Event Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h2 className="font-bold text-lg" style={{ color: COLORS.green }}>
                        {event.eventName}
                      </h2>
                      <p className="text-xs mt-1" style={{ color: COLORS.charcoal, opacity: 0.6 }}>
                        Created: {new Date(event.createdAt?.toDate?.() || event.createdAt).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span
                      className="text-xs font-medium px-3 py-1 rounded-full"
                      style={{
                        backgroundColor: isLastRound ? COLORS.flagPale : COLORS.greenPale,
                        color: isLastRound ? COLORS.flag : COLORS.green,
                      }}
                    >
                      {isLastRound ? 'Final Round' : `Round ${currentRoundIdx + 1}/${event.rounds.length}`}
                    </span>
                  </div>

                  {/* Event Details */}
                  <div
                    className="mb-4 p-3 rounded-lg text-sm"
                    style={{ backgroundColor: COLORS.cream }}
                  >
                    <div className="flex justify-between mb-2">
                      <span style={{ color: COLORS.charcoal, opacity: 0.7 }}>Current Round:</span>
                      <span className="font-medium" style={{ color: COLORS.charcoal }}>
                        {currentRound?.label || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span style={{ color: COLORS.charcoal, opacity: 0.7 }}>Admin Email:</span>
                      <span className="font-medium" style={{ color: COLORS.charcoal }}>
                        {event.adminEmail || 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: COLORS.charcoal, opacity: 0.7 }}>Total Rounds:</span>
                      <span className="font-medium" style={{ color: COLORS.charcoal }}>
                        {event.rounds.length}
                      </span>
                    </div>
                  </div>

                  {/* Progress Button */}
                  {!isLastRound && (
                    <button
                      onClick={() => progressEvent(event.id)}
                      disabled={progressingEventId === event.id}
                      className="w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 text-white"
                      style={{
                        backgroundColor: progressingEventId === event.id ? COLORS.line : COLORS.gold,
                        opacity: progressingEventId === event.id ? 0.6 : 1,
                      }}
                    >
                      <span>Progress to {nextRound?.label}</span>
                      <ChevronRight size={18} />
                    </button>
                  )}

                  {isLastRound && (
                    <div
                      className="w-full py-2.5 rounded-lg text-center font-medium"
                      style={{
                        backgroundColor: COLORS.greenPale,
                        color: COLORS.green,
                      }}
                    >
                      ✅ Tournament Complete
                    </div>
                  )}

                  {/* Progress Error */}
                  {progressError && progressingEventId === event.id && (
                    <p className="text-xs mt-2" style={{ color: COLORS.flag }}>
                      {progressError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* No Events */}
        {!loading && events.length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg font-medium mb-2" style={{ color: COLORS.charcoal }}>
              No active events
            </p>
            <p style={{ color: COLORS.charcoal, opacity: 0.6 }}>
              Events will appear here once they're created
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t" style={{ borderColor: COLORS.line }}>
          <p className="text-xs text-center" style={{ color: COLORS.charcoal, opacity: 0.5 }}>
            Logged in as: {user?.email}
          </p>
          <div className="flex gap-2 justify-center mt-3">
            <Link
              href="/"
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
            >
              ← Back to App
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
