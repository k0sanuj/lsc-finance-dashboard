import "./globals.css";
import { Archivo, Space_Grotesk } from "next/font/google";
import { getOptionalSession } from "../lib/auth";
import { SessionShell } from "./session-shell";

export const metadata = {
  title: "LSC Finance Dashboard",
  description: "Living finance dashboard for League Sports Co"
};

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getOptionalSession();

  return (
    <html lang="en">
      <body className={`${archivo.variable} ${spaceGrotesk.variable}`}>
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
