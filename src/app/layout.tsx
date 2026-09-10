import type { Metadata } from 'next';
import { DM_Sans, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { PRE_READY_STUB_SCRIPT } from '@/lib/host-api/pre-ready-stub';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SCXML Parser & Editor',
  description: 'SCXML Parser & Editor',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Pre-init stub so host apps can call window.ScxmlEditorAPI before React mounts.
            Queued calls are drained by useHostAPIBridge() (src/app/_hooks/use-host-api-bridge.ts,
            called from page.tsx) once the real API is ready. Script source lives in
            src/lib/host-api/pre-ready-stub.ts so tests can execute the same code. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_READY_STUB_SCRIPT }} />
        {/* Apply persisted/system theme before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();` }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
