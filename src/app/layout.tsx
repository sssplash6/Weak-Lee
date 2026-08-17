import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { auth } from "@/auth";
import { isDailyReporter, isDailyReportRecipient } from "@/lib/dailyReports";
import { SiteNav } from "./_components/SiteNav";
import { Toaster } from "./_components/Toaster";
import "./globals.css";

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
    template: "%s · FreshWeek",
    default: "FreshWeek",
  },
  description: "Track up to 5 weekly goals and their subtasks.",
};

// Runs synchronously during HTML parsing, before first paint: apply the saved
// theme (or the OS preference when none is saved) so there's no light-mode
// flash. `suppressHydrationWarning` on <html> lets this win over the SSR default.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Whether to show the "Daily reports" nav entry: reporters write there,
  // the recipient reads there, nobody else has business on the page.
  const session = await auth().catch(() => null);
  const email = session?.user?.email;
  const showDailyReports =
    isDailyReporter(email) || isDailyReportRecipient(email);

  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteNav showDailyReports={showDailyReports} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
