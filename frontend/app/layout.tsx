import type { Metadata } from 'next';
import { Press_Start_2P } from 'next/font/google';
import './globals.css';

const pixelFont = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pixel',
});

export const metadata: Metadata = {
  title: 'MOONSHOT',
  description: 'A generative trading game',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${pixelFont.variable} font-[family-name:var(--font-pixel)]`}>
        {children}
      </body>
    </html>
  );
}
