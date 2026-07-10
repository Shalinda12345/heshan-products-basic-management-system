import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";

import "./globals.css";
import NavigationBar from "./components/navigation-bar/page";
import SessionChecker from "./components/session-checker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Basic Manager",
  description: "Business Management System",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  const cookieStore = await cookies();

  const loggedIn = cookieStore.has("auth_token");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <SessionChecker />

        {loggedIn && <NavigationBar />}

        {children}

      </body>
    </html>
  );
}