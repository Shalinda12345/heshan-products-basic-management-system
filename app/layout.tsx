import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import NavigationBar from "./components/navigation-bar";
import SessionChecker from "./components/session-checker";
import { UserProvider } from "./components/auth/user-provider";
import { getCurrentUser, toUserInfo } from "./lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Heshan Products — Business Manager",
    template: "%s · Heshan Products",
  },
  description: "Sales, expenses, stock and reports for Heshan Products",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  // The signed-in user, checked against the database (a disabled user gets no menus)
  const user = await getCurrentUser();
  const userInfo = user ? toUserInfo(user) : null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <UserProvider user={userInfo}>
          <SessionChecker />

          {userInfo && !userInfo.mustChangePassword && <NavigationBar />}

          {children}
        </UserProvider>
      </body>
    </html>
  );
}
