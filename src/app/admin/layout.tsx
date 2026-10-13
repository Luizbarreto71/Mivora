import type { Metadata } from "next";

// The admin area is per-request by nature (session cookies): it may block on the server.
export const instant = false;

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin MIVORA" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[#fafaf9]">{children}</div>;
}
