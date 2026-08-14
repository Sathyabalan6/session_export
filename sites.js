// sites.js — Built-in site profiles
// Each profile defines domains, critical session cookies, and login URL

const BUILTIN_SITES = {
  twitter: {
    id: "twitter",
    name: "Twitter / X",
    icon: "𝕏",
    domains: ["twitter.com", "x.com"],
    criticalCookies: ["auth_token", "ct0", "twid", "kdt", "lang",
      "guest_id", "guest_id_ads", "guest_id_marketing",
      "personalization_id", "att", "_twitter_sess"],
    loginUrl: "https://x.com/home"
  },
  reddit: {
    id: "reddit",
    name: "Reddit",
    icon: "🤖",
    domains: ["reddit.com", "www.reddit.com", "redd.it"],
    criticalCookies: ["reddit_session", "token_v2", "csrf_token",
      "loid", "edgebucket", "session_tracker"],
    loginUrl: "https://www.reddit.com"
  },
  github: {
    id: "github",
    name: "GitHub",
    icon: "🐙",
    domains: ["github.com", "gist.github.com"],
    criticalCookies: ["user_session", "dotcom_user", "_gh_sess", "_device_id"],
    loginUrl: "https://github.com"
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    icon: "📸",
    domains: ["instagram.com", "www.instagram.com"],
    criticalCookies: ["sessionid", "ds_user_id", "csrftoken", "mid", "ig_did", "datr"],
    loginUrl: "https://www.instagram.com"
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    icon: "💼",
    domains: ["linkedin.com", "www.linkedin.com"],
    criticalCookies: ["li_at", "JSESSIONID", "liap", "li_a"],
    loginUrl: "https://www.linkedin.com/feed"
  },
  google: {
    id: "google",
    name: "Google",
    icon: "🔍",
    domains: ["google.com", "mail.google.com", "accounts.google.com"],
    criticalCookies: ["SID", "HSID", "SSID", "OSID", "SAPISID", "APISID",
      "__Secure-1PSID", "__Secure-3PSID", "__Secure-OSID"],
    loginUrl: "https://mail.google.com",
    note: "Google uses Device Bound Session Credentials (DBSC) — cookie cloning may have limited effectiveness."
  },
  discord: {
    id: "discord",
    name: "Discord",
    icon: "🎮",
    domains: ["discord.com"],
    criticalCookies: [],
    loginUrl: "https://discord.com/app",
    requiresLocalStorage: true,
    note: "Discord stores auth in localStorage (key: token), not cookies. Cookie-only cloning will not work."
  }
};
