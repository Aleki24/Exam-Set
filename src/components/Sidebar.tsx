'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ViewState, ExamPaper } from '@/types';
import { createClient } from '@/utils/supabase/client';
import { formatDisplayName, getInitials } from '@/utils/userUtils';
import Image from 'next/image';

interface SidebarProps {
    currentView: ViewState;
    setView: (view: ViewState) => void;
    isOpen: boolean;
    onClose: () => void;
    brandName: string;
    recentExams?: ExamPaper[];
}

interface UserData {
    email?: string;
    full_name?: string;
    avatar_url?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, isOpen, onClose }) => {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showAccountMenu, setShowAccountMenu] = useState(false);

    // Fetch user on mount
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const supabase = createClient();
                const { data: { user: authUser } } = await supabase.auth.getUser();

                if (authUser) {
                    setUser({
                        email: authUser.email,
                        full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name,
                        avatar_url: authUser.user_metadata?.avatar_url,
                    });
                } else {
                    setUser(null);
                }
            } catch (error) {
                console.error('Error fetching user:', error);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUser();

        // Listen for auth changes
        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                setUser({
                    email: session.user.email,
                    full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                    avatar_url: session.user.user_metadata?.avatar_url,
                });
            } else {
                setUser(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const navItems = [

        {
            id: 'bank' as ViewState, label: 'Questions', icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            )
        },
        {
            id: 'builder' as ViewState, label: 'Templates', icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            )
        },
        {
            id: 'library' as ViewState, label: 'Library', icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            )
        },
    ];

    const handleNavClick = (view: ViewState) => {
        setView(view);
        onClose();
    };

    const handleAccountClick = () => {
        setShowAccountMenu(!showAccountMenu);
    };

    const handleLogin = () => {
        router.push('/auth/login');
        setShowAccountMenu(false);
    };

    const handleLogout = async () => {
        try {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.push('/');
            router.refresh();
        } catch (error) {
            console.error('Logout error:', error);
        }
        setShowAccountMenu(false);
    };

    // Get display name and initials
    const displayName = user?.full_name || formatDisplayName(user?.email);
    const initials = getInitials(displayName);

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div className="fixed inset-0 bg-background/80 z-40 lg:hidden backdrop-blur-sm transition-opacity" onClick={onClose} />
            )}

            {/* Sidebar Container - Slim fixed width */}
            <div
                className={`
                    fixed inset-y-0 left-0 z-50 w-[72px] glass-sidebar flex flex-col items-center transition-transform duration-300 ease-in-out
                    lg:relative lg:translate-x-0 
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
            >
                {/* Logo */}
                <div className="py-6">
                    <div
                        className="w-12 h-12 bg-white rounded-xl border-2 border-slate-100 shadow-sm flex items-center justify-center cursor-pointer transition-all hover:shadow-md hover:border-blue-200 active:scale-95 overflow-hidden"
                        onClick={() => setView('bank')}
                    >
                        <Image
                            src="/logo1.png"
                            alt="MaarifaExams"
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>

                {/* Nav Items - Vertical layout with labels below icons */}
                <nav className="flex-1 flex flex-col items-center pt-4 space-y-6">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            className={`
                                flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all w-16
                                ${currentView === item.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
                            `}
                        >
                            {item.icon}
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </button>
                    ))}
                </nav>

                {/* Route-based Nav Links */}
                <div className="flex flex-col items-center space-y-2 mt-2 pt-4 border-t border-border/50">
                    <Link
                        href="/dashboard"
                        className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all w-16 text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        title="Dashboard"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" /></svg>
                        <span className="text-[10px] font-medium">Dashboard</span>
                    </Link>
                    <Link
                        href="/search"
                        className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all w-16 text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        title="Search Questions"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <span className="text-[10px] font-medium">Search</span>
                    </Link>
                    <Link
                        href="/admin"
                        className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all w-16 text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        title="Admin Panel"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        <span className="text-[10px] font-medium">Admin</span>
                    </Link>
                    <Link
                        href="/exams"
                        className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all w-16 text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        title="Browse Exams"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="text-[10px] font-medium">Exams</span>
                    </Link>
                </div>

                {/* Bottom Section - User Profile */}
                <div className="pb-4 px-2 flex flex-col items-center gap-3">
                    {/* User Avatar with Dropdown */}
                    <div className="relative">
                        <button
                            onClick={handleAccountClick}
                            disabled={isLoading}
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm ${user
                                ? 'bg-primary text-primary-foreground hover:opacity-90'
                                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent'
                                }`}
                        >
                            {isLoading ? (
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : user?.avatar_url ? (
                                <img src={user.avatar_url} alt={displayName} className="w-full h-full rounded-full object-cover" />
                            ) : user ? (
                                initials
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            )}
                        </button>

                        {/* Account Dropdown */}
                        {showAccountMenu && (
                            <div className="absolute left-full bottom-0 ml-2 w-44 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
                                {user ? (
                                    <>
                                        <div className="px-3 py-2 border-b border-border">
                                            <p className="text-xs font-bold text-foreground truncate">{displayName}</p>
                                            {user.email && (
                                                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                                            )}
                                        </div>
                                        <a
                                            href="/admin"
                                            className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            Admin Panel
                                        </a>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                            Sign Out
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={handleLogin}
                                        className="w-full px-3 py-2.5 text-left text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                                        Sign In
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Click outside to close account menu */}
            {showAccountMenu && (
                <div className="fixed inset-0 z-40" onClick={() => setShowAccountMenu(false)} />
            )}
        </>
    );
};

export default Sidebar;
