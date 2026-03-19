import "./globals.css";
import { getOptionalSession } from "../lib/auth";
import { SessionShell } from "./session-shell";

export const metadata = {
  title: "LSC Finance Dashboard",
  description: "Living finance dashboard for League Sports Co"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getOptionalSession();

  return (
    <html lang="en">
      <body>
        <a className="skip-to-content" href="#main-content">
          Skip to content
        </a>
        <SessionShell
          user={
            session
              ? {
                  fullName: session.fullName,
                  role: session.role
                }
              : null
          }
        >
          {children}
        </SessionShell>
      </body>
    </html>
  );
}
