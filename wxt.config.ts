import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "IG Unfollow Helper",
    description:
      "Review Instagram accounts that don't follow you back and unfollow them manually, at a safe pace.",
    permissions: ["storage", "sidePanel"],
    host_permissions: [
      "https://www.instagram.com/*",
      // Profile pictures
      "https://*.cdninstagram.com/*",
      "https://*.fbcdn.net/*",
    ],
    action: { default_title: "Open IG Unfollow Helper" },
  },
});
