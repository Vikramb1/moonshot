import type { Metadata } from 'next';
import { Press_Start_2P, Space_Mono } from 'next/font/google';
import './globals.css';

const pixelFont = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pixel',
});

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-space-mono',
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
      <body className={`${pixelFont.variable} ${spaceMono.variable} font-[family-name:var(--font-pixel)]`}>
        {children}
      </body>
    </html>
  );
}
