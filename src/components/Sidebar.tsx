'use client';

import React, { useState } from 'react';
import { ViewState, ExamPaper } from '@/types';

interface SidebarProps {
    currentView: ViewState;
    setView: (view: ViewState) => void;
    isOpen: boolean;
    onClose: () => void;
    brandName: string;
    recentExams?: ExamPaper[];
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, isOpen, onClose }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);

    const navItems = [
        {
            id: 'materials' as ViewState, label: 'Dashboard', icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            )
        },
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

    const handleLoginLogout = () => {
        setIsLoggedIn(!isLoggedIn);
        setShowAccountMenu(false);
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div className="fixed inset-0 bg-background/80 z-40 lg:hidden backdrop-blur-sm transition-opacity" onClick={onClose} />
            )}

            {/* Sidebar Container - Slim fixed width */}
            <div
                className={`
                    fixed inset-y-0 left-0 z-50 w-[72px] bg-card flex flex-col items-center transition-transform duration-300 ease-in-out border-r border-border
                    lg:relative lg:translate-x-0 
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
            >
                {/* Logo */}
                <div className="py-6">
                    <div
                        className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground cursor-pointer transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
                        onClick={() => setView('materials')}
                    >
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0z" /></svg>
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

                {/* Bottom Section - Notification & User Profile */}
                <div className="pb-4 px-2 flex flex-col items-center gap-3">
                    {/* Notification */}
                    <button className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    </button>

                    {/* User Avatar with Dropdown */}
                    <div className="relative">
                        <button
                            onClick={handleAccountClick}
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm ${isLoggedIn ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                        >
                            {isLoggedIn ? 'HA' : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            )}
                        </button>

                        {/* Account Dropdown */}
                        {showAccountMenu && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
                                {isLoggedIn ? (
                                    <>
                                        <div className="px-3 py-2 border-b border-border">
                                            <p className="text-xs font-bold text-foreground">Haris Ahmed</p>
                                            <p className="text-[10px] text-muted-foreground">Admin</p>
                                        </div>
                                        <button
                                            onClick={handleLoginLogout}
                                            className="w-full px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                            Logout
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={handleLoginLogout}
                                        className="w-full px-3 py-2.5 text-left text-xs text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                                        Login
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

