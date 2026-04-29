import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
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
    <html lang='en'>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Pre-init stub so host apps can call window.ScxmlEditorAPI before React mounts.
            Queued calls are drained in page.tsx once the real API is ready. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  if(window.ScxmlEditorAPI)return;
  var q={ready:[],commands:[],feedback:[]};
  window.ScxmlEditorAPI={
    _q:q,
    onReady:function(cb){q.ready.push(cb);},
    registerCommand:function(o){q.commands.push(o);},
    showFeedback:function(m,l){q.feedback.push([m,l]);},
    loadScxml:function(){},
    getScxml:function(){return'';}
  };
})();` }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
