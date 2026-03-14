import './globals.css'

export const metadata = {
  title: 'MOONSHOT',
  description: 'Every coin you collect is a real trade',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  )
}
