'use client';

import { useAuth } from './auth-provider';
import AuthUI from './auth-ui';
import GolfApp from './golf-app';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

const DEFAULT_LOGO = "⛳";
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

function LogoDisplay({ logo, bigClass = "text-7xl" }: { logo: string; bigClass?: string }) {
  if (logo && (logo.startsWith("data:") || logo.startsWith("http"))) {
    return <img src={logo} className="max-h-20 max-w-48 object-contain" alt="Logo" />;
  }
  return <span className={bigClass}>{logo || DEFAULT_LOGO}</span>;
}

function getStoredEvents(): { id: string; eventName: string; savedAt?: number; rounds?: any[] }[] {
  const events: any[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("event-")) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        // Use savedAt if available, otherwise fall back to first round date
        const timestamp = data.savedAt || (data.rounds?.[0]?.date ? new Date(data.rounds[0].date).getTime() : 0);
        events.push({
          id: key.replace("event-", ""),
          eventName: data.eventName || "Unnamed event",
          savedAt: timestamp,
          rounds: data.rounds
        });
      }
    }
  } catch {}
  return events.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

function AdminHomeScreen({ onNewEvent, onOpenEvent }: { onNewEvent: () => void; onOpenEvent: (id: string, isPast: boolean) => void }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const currentId = (() => { try { return localStorage.getItem("ptm-golf-eventId"); } catch { return null; } })();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Fetch events from Firebase
  useEffect(() => {
    const fetchEvents = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const fetchedEvents = snapshot.docs
          .filter(doc => {
            const data = doc.data();
            return data.ownerId === user.uid;
          })
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              eventName: data.eventName || 'Unnamed event',
              createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
              rounds: data.rounds || [],
            };
          });
        setEvents(fetchedEvents);
      } catch (err) {
        console.warn('Could not load events from Firebase, using localStorage fallback:', err);
        setEvents(getStoredEvents());
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [user]);

  const handleDeleteEvent = async (eventId: string, eventName: string) => {
    try {
      // Delete from localStorage
      localStorage.removeItem(`event-${eventId}`);

      // Delete from Firebase collections if user is authenticated
      const response = await fetch('/api/delete-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      }).catch(() => null); // Silently fail if API endpoint doesn't exist yet

      setDeleteConfirm(null);
      // Refresh the page to update the event list
      window.location.reload();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete event. Please try again.");
    }
  };

  return (
    <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }} className="flex flex-col max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1" style={{ color: COLORS.green }}>Admin</h1>
      <p className="text-sm opacity-60 mb-6" style={{ color: COLORS.charcoal }}>Your events</p>

      <button onClick={onNewEvent}
        className="w-full py-3 rounded-xl font-medium mb-5 flex items-center justify-center gap-2"
        style={{ backgroundColor: COLORS.green, color: "white" }}>
        + Setup New Event
      </button>

      {deleteConfirm && (
        <div className="mb-4 p-4 rounded-xl border bg-white" style={{ borderColor: COLORS.flag }}>
          {(() => {
            const ev = events.find(e => e.id === deleteConfirm);
            const createdStr = ev?.savedAt
              ? new Date(ev.savedAt).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
              : "Unknown";
            return (
              <>
                <p className="text-sm font-medium mb-2" style={{ color: COLORS.charcoal }}>
                  Delete &ldquo;{ev?.eventName}&rdquo;?
                </p>
                <p className="text-xs opacity-60 mb-3" style={{ color: COLORS.charcoal }}>
                  Created: {createdStr}
                </p>
                <p className="text-xs mb-3" style={{ color: COLORS.flag }}>
                  This will delete the event from your device and Firebase. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDeleteEvent(deleteConfirm, ev?.eventName || "Event")}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: COLORS.flag }}>
                    Delete
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                    style={{ border: `1px solid ${COLORS.line}`, backgroundColor: "white" }}>
                    Cancel
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {loading && (
        <p className="text-sm opacity-60 text-center my-4" style={{ color: COLORS.charcoal }}>Loading your events...</p>
      )}

      {!loading && events.length > 0 && (
        <div className="flex flex-col gap-2">
          {events.map(ev => {
            const isCurrent = ev.id === currentId;
            const dateTimeStr = ev.createdAt
              ? new Date(ev.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
              : null;
            const eventUrl = `https://ptm-golf.vercel.app/?eventId=${ev.id}`;
            return (
              <div key={ev.id} className="w-full px-4 py-3 rounded-xl flex items-center justify-between"
                style={{ backgroundColor: "white", border: `1.5px solid ${isCurrent ? COLORS.gold : COLORS.line}` }}>
                <button onClick={() => onOpenEvent(ev.id, !isCurrent)}
                  className="flex-1 text-left">
                  <p className="font-medium text-sm" style={{ color: COLORS.charcoal }}>{ev.eventName}</p>
                  {dateTimeStr && <p className="text-xs opacity-60 mt-0.5" style={{ color: COLORS.charcoal }}>Created: {dateTimeStr}</p>}
                </button>
                <div className="flex items-center gap-1 ml-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: isCurrent ? COLORS.goldPale : COLORS.greenPale, color: isCurrent ? COLORS.gold : COLORS.green }}>
                    {isCurrent ? "Current" : "Past"}
                  </span>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: `${ev.eventName} - PTM Golf`,
                          text: `Join my golf event: ${ev.eventName}`,
                          url: eventUrl,
                        }).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(eventUrl);
                        alert("Event URL copied to clipboard!");
                      }
                    }}
                    className="p-1.5 rounded-lg hover:opacity-70 flex-shrink-0"
                    style={{ color: COLORS.gold }}
                    title="Share event QR code">
                    📱
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(ev.id);
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(ev.id);
                    }}
                    className="p-2 rounded-lg hover:opacity-70 active:opacity-50 flex-shrink-0 touch-none"
                    style={{ color: COLORS.flag, minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" }}
                    title="Delete event">
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && events.length === 0 && (
        <p className="text-sm opacity-50 text-center mt-4" style={{ color: COLORS.charcoal }}>No events found.</p>
      )}
    </div>
  );
}

function WelcomePage({ onLoginClick, onAdminClick, logo, links, eventName }) {
  return (
    <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }} className="flex flex-col max-w-md mx-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="mb-4 flex items-center justify-center"><LogoDisplay logo={logo} /></div>
        <h1 className="text-4xl font-bold mb-2" style={{ color: COLORS.green }}>
          PTM Golf
        </h1>
        {eventName ? (
          <p className="text-lg font-semibold mb-2" style={{ color: COLORS.green }}>
            {eventName}
          </p>
        ) : null}
        <p className="text-sm opacity-60 mb-8 text-center">
          {eventName ? "Join the event by signing in" : "Track your golf scores in real-time"}
        </p>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={onLoginClick}
            className="w-full py-3 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.green, color: "white" }}
          >
            Sign In / Sign Up
          </button>
        </div>
      </div>

      {links && links.length > 0 && (
        <div className="px-4 py-6 border-t" style={{ borderColor: COLORS.line }}>
          <p className="text-xs font-medium mb-3 opacity-60" style={{ color: COLORS.charcoal }}>
            Useful Links
          </p>
          <div className="flex flex-col gap-2">
            {links.map((link, idx) => (
              <a
                key={idx}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm px-3 py-2 rounded-lg text-center"
                style={{ backgroundColor: COLORS.greenPale, color: COLORS.green }}
              >
                {link.label} →
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// License Key Modal — validates key against Firebase via API
function LicenseKeyModal({ onSuccess, onCancel }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if a valid key is already stored in localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ptm-license") || "null");
      if (stored?.key && stored?.maxSlots) {
        // Verify it hasn't expired client-side
        if (!stored.expiresAt || new Date(stored.expiresAt) > new Date()) {
          onSuccess({ maxSlots: stored.maxSlots, tier: stored.tier });
        } else {
          localStorage.removeItem("ptm-license");
        }
      }
    } catch {}
  }, []);

  const handleSubmit = async () => {
    if (!key.trim()) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!data.valid) {
        setError(data.error || "Invalid license key");
        setKey("");
        return;
      }
      localStorage.setItem("ptm-license", JSON.stringify({
        key: key.trim().toUpperCase(),
        maxSlots: data.maxSlots,
        tier: data.tier,
        expiresAt: data.expiresAt,
      }));
      onSuccess({ maxSlots: data.maxSlots, tier: data.tier });
    } catch {
      setError("Could not validate key. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 mx-4 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-1" style={{ color: COLORS.green }}>Admin Access</h2>
        <p className="text-xs opacity-60 mb-4" style={{ color: COLORS.charcoal }}>
          Enter your PTM Golf license key (format: PTM-XXXX-XXXX-XXXX)
        </p>
        <input
          type="text"
          placeholder="PTM-XXXX-XXXX-XXXX"
          value={key}
          onChange={(e) => { setKey(e.target.value.toUpperCase()); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="w-full px-3 py-2 rounded-lg border mb-1 font-mono text-sm tracking-wider"
          style={{ borderColor: COLORS.line, color: COLORS.charcoal }}
          autoFocus
          autoCapitalize="characters"
        />
        <p className="text-[11px] mb-4 opacity-50" style={{ color: COLORS.charcoal }}>
          Don't have a key?{" "}
          <a href="/get-key" target="_blank" className="underline" style={{ color: COLORS.green }}>
            Get one here →
          </a>
        </p>
        {error && <p className="text-xs mb-3" style={{ color: COLORS.flag }}>{error}</p>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.cream, color: COLORS.charcoal }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 py-2 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.green, color: "white", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Checking…" : "Enter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PostLoginHome({ eventName, onAdminSetup, onSignOut }) {
  return (
    <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }} className="flex flex-col max-w-md mx-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="text-6xl mb-4">⛳</div>
        <h1 className="text-3xl font-bold mb-6" style={{ color: COLORS.green }}>
          PTM Golf
        </h1>

        {eventName && (
          <p className="text-lg font-semibold mb-8" style={{ color: COLORS.green }}>
            {eventName}
          </p>
        )}

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={onAdminSetup}
            className="w-full py-3 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.gold, color: "white" }}
          >
            Admin
          </button>

          <button
            onClick={onSignOut}
            className="w-full py-3 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.flagPale, color: COLORS.flag }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showAdminHistory, setShowAdminHistory] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [adminModeAfterLogin, setAdminModeAfterLogin] = useState(false);
  const [openEventInitialTab, setOpenEventInitialTab] = useState<string | undefined>(undefined);
  const [adminLimits, setAdminLimits] = useState<{ maxSlots: number; tier: string } | null>(null);
  const [logo, setLogo] = useState(DEFAULT_LOGO);
  const [links, setLinks] = useState<any[]>([]);
  const [eventName, setEventName] = useState<string | null>(null);

  useEffect(() => {
    setLogo(localStorage.getItem("ptm-golf-logo") || DEFAULT_LOGO);
    try {
      setLinks(JSON.parse(localStorage.getItem("ptm-golf-links") || "[]"));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const eventId = params.get("eventId");
      if (eventId) localStorage.setItem("ptm-golf-eventId", eventId);
    }
  }, []);

  useEffect(() => {
    const loadEventName = () => {
      const params = new URLSearchParams(window.location.search);
      const eventId = params.get("eventId");
      if (eventId) {
        const eventData = localStorage.getItem(`event-${eventId}`);
        if (eventData) {
          const parsed = JSON.parse(eventData);
          setEventName(parsed.eventName);
        }
      } else {
        setEventName(null);
      }
    };
    loadEventName();
    const interval = setInterval(loadEventName, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onPopState() {
      setAdminModeAfterLogin(false);
      setOpenEventInitialTab(undefined);
      setShowAdminHistory(true);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-green-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-200 border-t-green-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const params = new URLSearchParams(window.location.search);
  const urlEventId = params.get("eventId");
  const localEventId = localStorage.getItem("ptm-golf-eventId");
  const hasEventId = urlEventId || localEventId;

  if (!user && hasEventId) return <AuthUI />;

  function handleOpenEvent(id: string, isPast: boolean) {
    localStorage.setItem("ptm-golf-eventId", id);
    if (typeof window !== "undefined") {
      window.history.pushState({ adminHistory: true }, "", `?eventId=${id}`);
    }
    setOpenEventInitialTab(isPast ? "results" : undefined);
    setShowAdminHistory(false);
    setAdminModeAfterLogin(true);
  }

  if (!user) {
    if (showAdminHistory) {
      return (
        <AdminHomeScreen
          onNewEvent={() => { setShowAdminHistory(false); setShowAdminModal(true); }}
          onOpenEvent={handleOpenEvent}
        />
      );
    }
    if (showAdminModal) {
      return (
        <LicenseKeyModal
          onSuccess={(limits) => {
            setAdminLimits(limits);
            setShowAdminModal(false);
            setShowAdminSetup(true);
          }}
          onCancel={() => { setShowAdminModal(false); setShowAdminHistory(false); }}
        />
      );
    }
    if (showAdminSetup) {
      return (
        <GolfApp
          userId="admin"
          isAdmin={true}
          adminLimits={adminLimits}
          onAdminDone={() => {
            setShowAdminSetup(false);
            setLogo(localStorage.getItem("ptm-golf-logo") || DEFAULT_LOGO);
            try { setLinks(JSON.parse(localStorage.getItem("ptm-golf-links") || "[]")); } catch {}
          }}
        />
      );
    }
    if (showLogin) return <AuthUI />;
    return (
      <WelcomePage
        onLoginClick={() => setShowLogin(true)}
        onAdminClick={() => setShowAdminHistory(true)}
        logo={logo}
        links={links}
        eventName={eventName}
      />
    );
  }

  // Authenticated user
  if (showAdminHistory) {
    return (
      <AdminHomeScreen
        onNewEvent={() => { setShowAdminHistory(false); setShowAdminModal(true); }}
        onOpenEvent={handleOpenEvent}
      />
    );
  }
  if (showAdminModal) {
    return (
      <LicenseKeyModal
        onSuccess={(limits) => {
          setAdminLimits(limits);
          setShowAdminModal(false);
          setAdminModeAfterLogin(true);
        }}
        onCancel={() => { setShowAdminModal(false); setShowAdminHistory(false); }}
      />
    );
  }

  let eventId = urlEventId || localEventId;
  if (urlEventId) localStorage.setItem("ptm-golf-eventId", urlEventId);

  let isEventAdmin = false;
  if (eventId && !adminModeAfterLogin) {
    try {
      const eventData = localStorage.getItem(`event-${eventId}`);
      if (eventData) {
        const config = JSON.parse(eventData);
        isEventAdmin = config.adminUserId && config.adminUserId === user.uid;
      }
    } catch {}
  }

  if (eventId && !adminModeAfterLogin) {
    return <GolfApp userId={user.uid} isAdmin={isEventAdmin} />;
  }

  if (adminModeAfterLogin) {
    const handleBackToEvents = () => {
      setAdminModeAfterLogin(false);
      setOpenEventInitialTab(undefined);
      setShowAdminHistory(true);
      localStorage.removeItem("ptm-golf-eventId");
      if (typeof window !== "undefined") {
        window.history.pushState({}, "", "/");
      }
    };
    return (
      <GolfApp
        userId={user.uid}
        isAdmin={true}
        adminLimits={adminLimits}
        initialTab={openEventInitialTab}
        onBack={handleBackToEvents}
        onAdminDone={() => {
          setAdminModeAfterLogin(false);
          setOpenEventInitialTab(undefined);
          setLogo(localStorage.getItem("ptm-golf-logo") || DEFAULT_LOGO);
          try { setLinks(JSON.parse(localStorage.getItem("ptm-golf-links") || "[]")); } catch {}
        }}
      />
    );
  }

  return (
    <PostLoginHome
      eventName={eventName}
      onAdminSetup={() => setShowAdminHistory(true)}
      onSignOut={async () => { await logout(); }}
    />
  );
}
