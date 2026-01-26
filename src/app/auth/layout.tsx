export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="overflow-y-auto h-screen">
            {children}
        </div>
    );
}
