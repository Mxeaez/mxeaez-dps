import React, { PropsWithChildren } from 'react';
import 'react-toastify/dist/ReactToastify.css';
import '@xyflow/react/dist/style.css';
import '../globals.css';
import { Metadata } from 'next';
import { ibm, pts } from '@/fonts';
import ClientProviders from '@/app/components/ClientProviders';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || ''),
  title: 'mxeaez DPS - OSRS DPS Calculator (fork of the OSRS Wiki calculator)',
  description: "A fork of the OSRS Wiki's damage-per-second calculator with The Fractured Archive bosses and a best-setup finder.",
  authors: [{ name: 'OSRS Wiki', url: 'https://oldschool.runescape.wiki' }],
  keywords: ['osrs', 'old school runescape', 'runescape', 'dps calculator', 'osrs dps', 'osrs wiki', 'osrs wiki dps'],
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_URL}${process.env.NEXT_PUBLIC_BASE_PATH || ''}` },
  twitter: {
    card: 'summary',
  },
};

const RootLayout: React.FC<PropsWithChildren> = (props) => {
  const { children } = props;

  return (
  // We are suppressing hydration warnings here so that react-themes works correctly.
  // See https://github.com/pacocoursey/next-themes/issues/152#issuecomment-1364280564
    <html suppressHydrationWarning lang="en" className={`${pts.variable} ${ibm.variable}`}>
      <body>
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
};

export default RootLayout;
