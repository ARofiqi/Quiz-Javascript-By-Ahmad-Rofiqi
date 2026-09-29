import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Kuis Kustom dari Materi',
    description: 'Ubah materi belajar menjadi kuis pilihan ganda yang dirancang khusus untukmu.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="id">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap" rel="stylesheet" />
            </head>
            <body>{children}</body>
        </html>
    );
}
