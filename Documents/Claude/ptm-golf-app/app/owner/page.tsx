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
  const [qrEventId, setQrEventId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [completingEventId, setCompletingEventId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [scoringProgress, setScoringProgress] = useState<{ [key: string]: any }>({});
  const [checkingScoringForEventId, setCheckingScoringForEventId] = useState<string | null>(null);

  // Check if user is owner
  const isOwner = user?.email === OWNER_EMAIL;
  const isAuthLoading = !user; // Still waiting for auth to complete

  useEffect(() => {
    if (user && !isOwner) {
      setError('Access denied. Owner login required.');
      setLoading(false);
      return;
    }

    if (isOwner) {
      fetchEvents();
    }
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

  const checkRoundScoring = async (eventId: string) => {
    try {
      if (!user) return null;

      const idToken = await user.getIdToken();
      const response = await fetch('/api/owner/check-round-scoring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ eventId }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Event not found (may have been deleted), silently ignore
          return null;
        }
        console.error('Failed to check scoring:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      setScoringProgress(prev => ({ ...prev, [eventId]: data }));
      return data;
    } catch (err) {
      console.error('Failed to check scoring:', err);
      return null;
    }
  };

  const completeEndOfDay = async (eventId: string) => {
    try {
      setCompletingEventId(eventId);

      if (!user) {
        throw new Error('Not authenticated');
      }

      // Check if scoring has started
      const scoring = await checkRoundScoring(eventId);
      if (scoring && scoring.scoreCount === 0) {
        throw new Error('No scoring has been recorded yet. Start scoring first.');
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
        throw new Error(data.error || 'Failed to complete end-of-day');
      }

      await fetchEvents();
      alert('✅ End of day completed! Round progressed.');
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('Failed to complete end-of-day:', err);
    } finally {
      setCompletingEventId(null);
    }
  };

  const deleteEvent = async (eventId: string) => {
    try {
      setDeletingEventId(eventId);

      if (!user) {
        throw new Error('Not authenticated');
      }

      const idToken = await user.getIdToken();

      const response = await fetch('/api/delete-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ eventId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete event');
      }

      await fetchEvents();
      alert('✅ Event deleted successfully!');
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('Failed to delete event:', err);
    } finally {
      setDeletingEventId(null);
    }
  };

  const exportEventData = (event: any) => {
    const dataStr = JSON.stringify(event, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `event-${event.id}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isAuthLoading) {
    return (
      <div style={{ backgroundColor: COLORS.cream, minHeight: '100vh' }} className="flex items-center justify-center px-4">
        <div className="text-center">
          <p style={{ color: COLORS.charcoal, opacity: 0.6 }}>Loading...</p>
        </div>
      </div>
    );
  }

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
                      <span style={{ color: COLORS.charcoal, opacity: 0.7 }}>Event ID:</span>
                      <span className="font-medium font-mono text-xs" style={{ color: COLORS.charcoal }}>
                        {event.id}
                      </span>
                    </div>
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

                  {/* Buttons */}
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setQrEventId(event.id)}
                      className="flex-1 py-2.5 rounded-lg font-medium text-sm"
                      style={{
                        backgroundColor: COLORS.greenPale,
                        color: COLORS.green,
                      }}
                      title="Get QR Code"
                    >
                      📱 QR Code
                    </button>
                    <button
                      onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                      className="flex-1 py-2.5 rounded-lg font-medium text-sm"
                      style={{
                        backgroundColor: COLORS.greenPale,
                        color: COLORS.green,
                      }}
                      title="View event details"
                    >
                      {expandedEventId === event.id ? '▼' : '▶'} Details
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {expandedEventId === event.id && (
                    <div
                      className="mb-4 p-4 rounded-lg text-sm border-t space-y-3"
                      style={{ backgroundColor: COLORS.cream, borderColor: COLORS.line }}
                      onMouseEnter={() => !scoringProgress[event.id] && checkRoundScoring(event.id)}
                    >
                      {/* Tournament Progress */}
                      <div>
                        <p className="font-medium mb-2" style={{ color: COLORS.green }}>Tournament State</p>
                        <div className="text-xs space-y-1" style={{ color: COLORS.charcoal }}>
                          {(() => {
                            const currentRoundIdx = event.rounds?.findIndex((r: any) => r.id === event.currentRoundId) ?? 0;
                            const currentRound = event.rounds?.[currentRoundIdx];
                            const progress = scoringProgress[event.id];

                            // Determine status based on scoring progress
                            let statusEmoji = '⏳';
                            let statusText = 'Awaiting scores';

                            if (progress) {
                              if (progress.scoreCount === 0) {
                                statusEmoji = '⏳';
                                statusText = 'Awaiting scores';
                              } else if (progress.groupsWithScores < progress.totalGroups) {
                                statusEmoji = '🎯';
                                statusText = 'Scoring in progress';
                              } else if (progress.groupsWithScores === progress.totalGroups && progress.totalGroups > 0) {
                                statusEmoji = '✅';
                                statusText = 'Complete';
                              }
                            }

                            return (
                              <>
                                <p><strong>Current Round:</strong> {currentRound?.label || 'Not started'} ({currentRoundIdx + 1}/{event.rounds?.length || '?'})</p>
                                <p style={{ opacity: 0.7 }}>
                                  {statusEmoji} {statusText}
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Scoring Progress */}
                      {scoringProgress[event.id] && (
                        <div>
                          <p className="font-medium mb-2" style={{ color: COLORS.green }}>Scoring Progress</p>
                          <div className="text-xs space-y-1" style={{ color: COLORS.charcoal }}>
                            <p>
                              <strong>Groups with Scores:</strong> {scoringProgress[event.id].groupsWithScores}/{scoringProgress[event.id].totalGroups}
                            </p>
                            <p>
                              <strong>Total Scores:</strong> {scoringProgress[event.id].scoreCount}
                            </p>
                            <p style={{ opacity: 0.7 }}>
                              {scoringProgress[event.id].message}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Configuration Summary */}
                      <div>
                        <p className="font-medium mb-2" style={{ color: COLORS.green }}>Setup</p>
                        <div className="text-xs grid grid-cols-2 gap-2" style={{ color: COLORS.charcoal }}>
                          <p><strong>Players:</strong> {event.players?.length || 0}</p>
                          <p><strong>Groups:</strong> {event.groups?.length || 0}</p>
                          <p><strong>Competitions:</strong> {event.competitions?.filter((c: any) => c.selected).length || 0}</p>
                          <p><strong>Matches:</strong> {event.matches?.length || 0}</p>
                        </div>
                      </div>

                      {/* Players List */}
                      {event.players && event.players.length > 0 && (
                        <div>
                          <p className="font-medium mb-1" style={{ color: COLORS.green }}>Players ({event.players.length})</p>
                          <div className="text-xs max-h-40 overflow-y-auto" style={{ color: COLORS.charcoal }}>
                            {event.players.map((p: any) => (
                              <div key={p.id} className="py-0.5">
                                {p.name} <span style={{ opacity: 0.6 }}>({p.handicapIndex})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => exportEventData(event)}
                          className="flex-1 py-2 px-2 rounded text-xs font-medium text-white"
                          style={{ backgroundColor: COLORS.greenLight }}
                        >
                          📥 Export
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${event.eventName}"? This cannot be undone.`)) {
                              deleteEvent(event.id);
                            }
                          }}
                          disabled={deletingEventId === event.id}
                          className="flex-1 py-2 px-2 rounded text-xs font-medium text-white"
                          style={{
                            backgroundColor: deletingEventId === event.id ? COLORS.line : COLORS.flag,
                            opacity: deletingEventId === event.id ? 0.6 : 1,
                          }}
                        >
                          {deletingEventId === event.id ? '⏳' : '🗑️'} Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {!isLastRound && !progressingEventId && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => progressEvent(event.id)}
                        disabled={progressingEventId === event.id}
                        className="flex-1 py-2.5 rounded-lg font-medium text-white"
                        style={{
                          backgroundColor: progressingEventId === event.id ? COLORS.line : COLORS.gold,
                          opacity: progressingEventId === event.id ? 0.6 : 1,
                        }}
                      >
                        Progress
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Complete end-of-day and progress to next round?')) {
                            completeEndOfDay(event.id);
                          }
                        }}
                        disabled={completingEventId === event.id}
                        className="flex-1 py-2.5 rounded-lg font-medium text-white"
                        style={{
                          backgroundColor: completingEventId === event.id ? COLORS.line : COLORS.flag,
                          opacity: completingEventId === event.id ? 0.6 : 1,
                        }}
                        title="If admin can't complete end-of-day"
                      >
                        {completingEventId === event.id ? '⏳' : '✅'} End Day
                      </button>
                    </div>
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

        {/* QR Code Modal */}
        {qrEventId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
              {(() => {
                const event = events.find(e => e.id === qrEventId);
                const qrUrl = `https://ptm-golf.vercel.app/?eventId=${qrEventId}`;
                return (
                  <>
                    <h2 className="text-lg font-bold mb-2" style={{ color: COLORS.green }}>
                      📱 Event QR Code
                    </h2>
                    <p className="text-sm mb-4" style={{ color: COLORS.charcoal, opacity: 0.7 }}>
                      {event?.eventName}
                    </p>

                    <div
                      className="p-4 rounded-lg mb-4 text-center"
                      style={{ backgroundColor: COLORS.cream }}
                    >
                      <p className="text-xs mb-3" style={{ color: COLORS.charcoal, opacity: 0.6 }}>
                        Share this link with scorers:
                      </p>
                      <p
                        className="text-xs font-mono break-all mb-3 p-2 rounded"
                        style={{ backgroundColor: "white", color: COLORS.charcoal, border: `1px solid ${COLORS.line}` }}
                      >
                        {qrUrl}
                      </p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(qrUrl);
                          alert("QR Code URL copied to clipboard!");
                        }}
                        className="w-full py-2 rounded-lg text-sm font-medium text-white mb-2"
                        style={{ backgroundColor: COLORS.gold }}
                      >
                        📋 Copy URL
                      </button>
                      <button
                        onClick={() => window.open(qrUrl, '_blank')}
                        className="w-full py-2 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
                      >
                        🔗 Open Link
                      </button>
                    </div>

                    <button
                      onClick={() => setQrEventId(null)}
                      className="w-full py-2 rounded-lg text-sm font-medium"
                      style={{ border: `1px solid ${COLORS.line}`, backgroundColor: "white", color: COLORS.charcoal }}
                    >
                      Close
                    </button>
                  </>
                );
              })()}
            </div>
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
