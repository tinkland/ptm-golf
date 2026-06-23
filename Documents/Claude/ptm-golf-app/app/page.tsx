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

const ADMIN_PASSWORD = "adminptm";

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

function AdminPasswordModal({ onSuccess, onCancel }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (password === ADMIN_PASSWORD) {
      onSuccess();
    } else {
      setError("Incorrect password");
      setPassword("");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 mx-4 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-4" style={{ color: COLORS.green }}>
          Admin Access
        </h2>
        <input
          type="password"
          name="adminPassword"
          placeholder="Enter admin password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
          className="w-full px-3 py-2 rounded-lg border mb-4"
          style={{ borderColor: COLORS.line, color: COLORS.charcoal }}
          autoFocus
        />
        {error && <p className="text-xs text-red-600 mb-4">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.cream, color: COLORS.charcoal }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2 rounded-lg font-medium"
            style={{ backgroundColor: COLORS.green, color: "white" }}
          >
            Enter
          </button>
        </div>
      </div>
    </div>
  );
}

function PostLoginHome({ eventName, onAdminSetup, onJoinEvent, onSignOut }) {
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
          {eventName ? (
            <button
              onClick={onJoinEvent}
              className="w-full py-3 rounded-lg font-medium"
              style={{ backgroundColor: COLORS.green, color: "white" }}
            >
              Join Event
            </button>
          ) : (
            <button
              onClick={onAdminSetup}
              className="w-full py-3 rounded-lg font-medium"
              style={{ backgroundColor: COLORS.gold, color: "white" }}
            >
              Admin Setup
            </button>
          )}

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

  // Load event name whenever URL changes
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

  if (!user) {
    if (showAdminModal) {
      return (
        <AdminPasswordModal
          onSuccess={() => {
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
          onAdminDone={() => {
            setShowAdminSetup(false);
            setLogo(localStorage.getItem("ptm-golf-logo") || DEFAULT_LOGO);
            setLinks(JSON.parse(localStorage.getItem("ptm-golf-links") || "[]"));
          }}
        />
      );
    }

    if (showLogin) {
      return <AuthUI />;
    }

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

  // User is authenticated
  if (showAdminModal) {
    return (
      <AdminPasswordModal
        onSuccess={() => {
          setShowAdminModal(false);
          setAdminModeAfterLogin(true);
        }}
        onCancel={() => setShowAdminModal(false)}
      />
    );
  }

  if (adminModeAfterLogin) {
    return (
      <GolfApp
        userId={user.uid}
        isAdmin={true}
        onAdminDone={() => {
          setAdminModeAfterLogin(false);
          setLogo(localStorage.getItem("ptm-golf-logo") || DEFAULT_LOGO);
          setLinks(JSON.parse(localStorage.getItem("ptm-golf-links") || "[]"));
        }}
      />
    );
  }

  // Check if user has an event to join (eventId in URL)
  const params = new URLSearchParams(window.location.search);
  const hasEventId = params.get("eventId");

  if (hasEventId) {
    return <GolfApp userId={user.uid} isAdmin={false} />;
  }

  return (
    <PostLoginHome
      eventName={eventName}
      onAdminSetup={() => setShowAdminModal(true)}
      onJoinEvent={() => {
        // This button only shows if eventName is set, which means eventId exists
        // User clicks it to join, so we show GolfApp
      }}
      onSignOut={async () => {
        await logout();
      }}
    />
  );
}
