import type { Metadata } from 'next';
import { DM_Sans, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
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
            Queued calls are drained in page.tsx once the real API is ready. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  if(window.ScxmlEditorAPI)return;
  var q={ready:[],commands:[],ops:[]};
  window.ScxmlEditorAPI={
    _q:q,
    onReady:function(cb){q.ready.push(cb);},
    registerCommand:function(o){q.commands.push(o);},
    showFeedback:function(m,l){q.ops.push({type:'feedback',message:m,level:l});},
    setChannels:function(c){q.channels=c;},
    showErrors:function(errors){q.ops.push({type:'showErrors',errors:errors});},
    clearErrors:function(){q.ops.push({type:'clearErrors'});},
    loadScxml:function(){},
    getScxml:function(){return'';},
    toggleConfigPanel:function(){},
    setActiveTab:function(){}
  };
})();` }} />
        {/* Apply persisted/system theme before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();` }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
