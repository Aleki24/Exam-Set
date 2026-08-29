import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, FilePen, Mail, MessageCircle, Receipt, RefreshCw, Smartphone, UserPlus } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import { contactChannels, hasAnyChannel } from '@/lib/contact';

export const metadata: Metadata = {
    title: 'Contact & help — Skulbase',
    description:
        'Get help with a payment, a missing download or an account. Reach us on WhatsApp or by email, and find answers to the questions we are asked most.',
};

/**
 * CONTACT.
 *
 * Deliberately not a form. There is no mail transport configured anywhere in
 * this project, so a form would collect a message, show a cheerful confirmation
 * and drop it — which is worse than offering nothing, because the sender stops
 * looking for another way through.
 *
 * Every channel is rendered only if it is configured. A support address nobody
 * reads is the same failure in a different shape.
 */
export default function ContactPage() {
    const channels = contactChannels();
    const reachable = hasAnyChannel(channels);

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-16">
                <header className="page-header">
                    <p className="overline">Contact &amp; help</p>
                    <h1 className="display-2 mt-3">Something not working? Tell us.</h1>
                    <p className="lead mt-5">
                        Most messages we get are about a payment that went through without the
                        download appearing. If that is you, the answer is below — and if it does
                        not help, write to us and we will fix it by hand.
                    </p>
                </header>

                <div className="mt-12 grid gap-8 lg:grid-cols-[380px_1fr]">
                    {/* How to reach a person */}
                    <aside>
                        <div className="sheet p-6">
                            <h2 className="overline">Reach us</h2>

                            {reachable ? (
                                <ul className="mt-5 space-y-3">
                                    {channels.whatsapp && (
                                        <li>
                                            <a
                                                href={`https://wa.me/${channels.whatsapp}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn-primary w-full"
                                            >
                                                <MessageCircle className="h-4 w-4" aria-hidden />
                                                Message us on WhatsApp
                                            </a>
                                            <p className="figure meta mt-2">
                                                {channels.whatsappDisplay ?? channels.whatsapp}
                                            </p>
                                            <p className="meta mt-1">
                                                Fastest way to reach us, and the quickest route to a
                                                stuck payment.
                                            </p>
                                        </li>
                                    )}
                                    {channels.email && (
                                        <li className={channels.whatsapp ? 'pt-2' : ''}>
                                            <a href={`mailto:${channels.email}`} className="btn-outline w-full">
                                                <Mail className="h-4 w-4" aria-hidden />
                                                Email us
                                            </a>
                                            <p className="figure meta mt-2 break-all">{channels.email}</p>
                                        </li>
                                    )}
                                </ul>
                            ) : (
                                /*
                                 * Nothing is configured. Say so plainly rather
                                 * than printing a placeholder address that
                                 * silently swallows every message sent to it.
                                 */
                                <p className="meta mt-5">
                                    Our contact details are not published yet. In the meantime, the
                                    checkout page carries the paybill details and a box for your
                                    M-Pesa receipt, which resolves most payment problems without
                                    needing us at all.
                                </p>
                            )}

                            {(channels.paybill || channels.till) && (
                                <div className="mt-6 border-t border-border pt-5">
                                    <h3 className="overline">Paying by hand</h3>
                                    <p className="meta mt-2">
                                        If the M-Pesa prompt never arrives, pay directly and then
                                        enter the receipt number at checkout.
                                    </p>
                                    <dl className="mt-4 space-y-2 text-sm">
                                        {channels.paybill && (
                                            <div className="flex items-baseline justify-between gap-3">
                                                <dt className="text-muted-foreground">Paybill</dt>
                                                <dd className="figure font-bold">{channels.paybill}</dd>
                                            </div>
                                        )}
                                        {channels.till && (
                                            <div className="flex items-baseline justify-between gap-3">
                                                <dt className="text-muted-foreground">Till number</dt>
                                                <dd className="figure font-bold">{channels.till}</dd>
                                            </div>
                                        )}
                                    </dl>
                                </div>
                            )}
                        </div>
                    </aside>

                    {/* The questions we are actually asked */}
                    <section aria-labelledby="faq-heading" className="min-w-0">
                        <div className="rule-heading">
                            <h2 id="faq-heading" className="overline">
                                Asked most often
                            </h2>
                        </div>

                        <div className="surface mt-6 px-5 py-1">
                            <Faq
                                icon={Receipt}
                                question="I paid and nothing downloaded."
                                answer="Go back to the checkout page and enter your M-Pesa receipt number in the box beneath the payment button. That matches the payment to your order directly. It resolves almost every case, and it works even when Safaricom's confirmation to us was delayed or lost."
                            />
                            <Faq
                                icon={Smartphone}
                                question="The M-Pesa prompt never appeared on my phone."
                                answer="It happens, usually on a congested network. Pay to the paybill or till shown at checkout instead, then enter the receipt number — the result is identical. Check the number you typed too: it needs to be the phone that holds the M-Pesa account."
                            />
                            <Faq
                                icon={UserPlus}
                                question="Do I need an account to buy?"
                                answer="You can browse everything without one. You need an account to download, because that is what your purchase is attached to — without it there is nowhere to keep what you bought, and no way to give it back to you next term."
                            />
                            <Faq
                                icon={RefreshCw}
                                question="Can I download something twice?"
                                answer="As many times as you like, on as many devices as you like. Anything you have bought stays in your library permanently. There is no download limit and nothing expires."
                            />
                            <Faq
                                icon={Building2}
                                question="Can my school buy for the whole staff?"
                                answer="Buying several resources at once already brings the price down automatically, and a pass covers the whole catalogue for a term or a year. Per-teacher seats billed to a school are not built yet — write to us if that is what you need, because how many people ask will decide when we build it."
                            />
                            <Faq
                                icon={FilePen}
                                question="Can I edit what I download?"
                                answer="Every listing says what it is — a PDF prints as it stands, and a Word file you can edit first, which is what most schemes of work and lesson plans are. If you want a paper in your school's own format with your own choice of questions, the exam setter builds one from the question bank."
                            />
                        </div>

                        <div className="ruled mt-10 rounded-[var(--radius)] border border-border p-6 text-center">
                            <p className="lead">Still stuck?</p>
                            <p className="meta mx-auto mt-2 max-w-md">
                                Send us your M-Pesa receipt number and what you were trying to buy.
                                That is everything we need to find the payment and release the
                                download.
                            </p>
                            <div className="mt-5 flex flex-wrap justify-center gap-2">
                                <Link href="/library" className="btn-outline btn-sm">
                                    Check your library
                                </Link>
                                <Link href="/cart" className="btn-outline btn-sm">
                                    Back to checkout
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>
            </main>

            <Footer />
        </div>
    );
}

/** One question, folded away. `disclosure` styles the native `<details>`. */
function Faq({
    icon: Icon,
    question,
    answer,
}: {
    icon: React.ComponentType<{ className?: string }>;
    question: string;
    answer: string;
}) {
    return (
        // `.disclosure` brings the divider, the hidden native marker and the
        // rotating chevron. `summary` is already `justify-between`, so the icon
        // and the question travel together in one span and the chevron keeps
        // the right edge to itself.
        <details className="disclosure last:border-b-0">
            <summary>
                <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    {question}
                </span>
            </summary>
            <p className="meta max-w-2xl pb-1 leading-relaxed">{answer}</p>
        </details>
    );
}
