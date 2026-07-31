'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { Order } from '@/types/shop';

/**
 * The gap between "pay" and "paid".
 *
 * Shared by the cart and the subscription page, because the two sales settle
 * identically: an STK prompt when Daraja is wired up, and — always — the manual
 * paybill route underneath it. STK push fails often enough on Kenyan networks
 * that hiding the fallback would cost real sales, so it is never conditional.
 */
export default function PaymentPending({
    order,
    statusMessage,
    receipt,
    setReceipt,
    onSubmitReceipt,
    submitting,
}: {
    order: Order;
    statusMessage: string;
    receipt: string;
    setReceipt: (v: string) => void;
    onSubmitReceipt: () => void;
    submitting: boolean;
}) {
    const paybill = process.env.NEXT_PUBLIC_MPESA_PAYBILL;
    const till = process.env.NEXT_PUBLIC_MPESA_TILL;

    return (
        <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-semibold">Order {order.reference}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                    {statusMessage || 'Waiting for payment confirmation…'}
                </p>
                {order.status === 'awaiting_confirmation' && order.provider === 'mpesa' && (
                    <p className="mt-3 flex items-center gap-2 text-xs text-primary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Enter your M-Pesa PIN on your phone
                    </p>
                )}
            </div>

            {/* Manual fallback: always available, because STK can fail. */}
            <div className="rounded-lg border border-border p-4">
                <h3 className="overline">Or pay manually</h3>
                <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {(paybill || till) && (
                        <li>
                            1. M-Pesa → {paybill ? `Paybill ${paybill}` : `Buy Goods, Till ${till}`}
                        </li>
                    )}
                    <li>
                        {paybill || till ? '2.' : '1.'} Account number:{' '}
                        <strong className="text-foreground">{order.reference}</strong>
                    </li>
                    <li>{paybill || till ? '3.' : '2.'} Paste the confirmation code below</li>
                </ol>

                <div className="mt-3 flex gap-2">
                    <input
                        value={receipt}
                        onChange={(e) => setReceipt(e.target.value.toUpperCase())}
                        placeholder="SGH4X9ZQ12"
                        className="field font-mono text-sm uppercase"
                        maxLength={15}
                        aria-label="M-Pesa transaction code"
                    />
                    <button
                        type="button"
                        onClick={onSubmitReceipt}
                        disabled={submitting || receipt.length < 8}
                        className="btn-outline shrink-0"
                    >
                        Submit
                    </button>
                </div>
            </div>
        </div>
    );
}
