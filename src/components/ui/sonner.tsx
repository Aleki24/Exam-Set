'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts, on the design system.
 *
 * This was pinned to `theme="light"` with `bg-white`, `text-gray-900` and a
 * `bg-purple-600` action button — so every message in the checkout flow arrived
 * as a white card on a dark page, in a colour that appears nowhere else in the
 * product. The tokens already describe a popover; use them.
 */
const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group"
            richColors
            position="top-center"
            style={{ zIndex: 99999 }}
            toastOptions={{
                classNames: {
                    toast: 'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
                    description: 'group-[.toast]:text-muted-foreground',
                    actionButton:
                        'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
                    cancelButton:
                        'group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground',
                },
            }}
            {...props}
        />
    );
};

export { Toaster };
