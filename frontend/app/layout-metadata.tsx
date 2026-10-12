import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'ShopMate',
    description: 'ShopMate - A modern shopping experience',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            {children}
        </>
    );
}
