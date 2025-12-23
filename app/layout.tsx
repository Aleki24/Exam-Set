import React from 'react';

export default function RootLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col">
      {children}
    </div>
  );
}