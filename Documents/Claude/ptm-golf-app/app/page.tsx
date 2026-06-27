'use client';

import { useAuth } from './auth-provider';
import AuthUI from './auth-ui';
import GolfApp from './golf-app';
import { useState, useEffect } from 'react';

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

function WelcomePage({ onLoginClick, onAdminClick, logo, links, eventName }) {
  return (
    <div style={{ backgroundColor: COLORS.cream, minHeight: "100vh" }} className="flex flex-col max-w-md mx-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="text-7xl mb-4">{logo || DEFAULT_LOGO}</div>
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
            Admin Setup
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
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [adminModeAfterLogin, setAdminModeAfterLogin] = useState(false);
  const [adminLimits, setAdminLimits] = useState<{ maxSlots: number; tier: string } | null>(null);
  const [logo, setLogo] = useState(DEFAULT_LOGO);
  const [links, setLinks] = useState<any[]>([]);
  const [eventName, setEventName] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("ptm-golf-config");
    if (saved) {
      const config = JSON.parse(saved);
      if (config.logo) setLogo(config.logo);
      if (config.links) setLinks(config.links);
    }
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

  if (!user) {
    if (showAdminModal) {
      return (
        <LicenseKeyModal
          onSuccess={(limits) => {
            setAdminLimits(limits);
            setShowAdminModal(false);
            setShowAdminSetup(true);
          }}
          onCancel={() => setShowAdminModal(false)}
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
            setLinks(JSON.parse(localStorage.getItem("ptm-golf-links") || "[]"));
          }}
        />
      );
    }
    if (showLogin) return <AuthUI />;
    return (
      <WelcomePage
        onLoginClick={() => setShowLogin(true)}
        onAdminClick={() => setShowAdminModal(true)}
        logo={logo}
        links={links}
        eventName={eventName}
      />
    );
  }

  // Authenticated user
  if (showAdminModal) {
    return (
      <LicenseKeyModal
        onSuccess={(limits) => {
          setAdminLimits(limits);
          setShowAdminModal(false);
          setAdminModeAfterLogin(true);
        }}
        onCancel={() => setShowAdminModal(false)}
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
    return (
      <GolfApp
        userId={user.uid}
        isAdmin={true}
        adminLimits={adminLimits}
        onAdminDone={() => {
          setAdminModeAfterLogin(false);
          setLogo(localStorage.getItem("ptm-golf-logo") || DEFAULT_LOGO);
          setLinks(JSON.parse(localStorage.getItem("ptm-golf-links") || "[]"));
        }}
      />
    );
  }

  return (
    <PostLoginHome
      eventName={eventName}
      onAdminSetup={() => setShowAdminModal(true)}
      onSignOut={async () => { await logout(); }}
    />
  );
}
