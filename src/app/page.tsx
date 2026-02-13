'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useScroll, useSpring } from 'framer-motion';
import { createClient } from '@/utils/supabase/client';

// Components
import Navbar from '@/components/landing/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import LogoScroll from '@/components/landing/LogoScroll';
import FeaturesSection from '@/components/landing/FeaturesSection';
import StatsSection from '@/components/landing/StatsSection';
import PricingSection from '@/components/landing/PricingSection';
import Footer from '@/components/landing/Footer';
import GridBackground from '../components/landing/GridBackground';

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // Progress bar for scroll depth
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        // Race against a timeout to prevent infinite loading
        const authPromise = supabase.auth.getUser();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Auth check timed out')), 3000)
        );
        const { data: { user } } = await Promise.race([authPromise, timeoutPromise]) as any;
        if (user) {
          router.push('/app');
          return;
        }
      } catch (e) {
        console.error('Auth check failed:', e);
      }
      setIsLoading(false);
    };
    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#fafafa] selection:bg-blue-500/30">
      {/* 1. Reading Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-blue-600 origin-left z-[100]"
        style={{ scaleX }}
      />

      {/* 2. Modern Subtle Background Decor */}
      <GridBackground />
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-50/50 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-50/50 blur-[120px]" />
      </div>

      <Navbar />

      <main className="relative z-10">
        {/* Hero Section - Immediate Entrance */}
        <SectionWrapper delay={0.1}>
          <HeroSection />
        </SectionWrapper>

        {/* Social Proof - Subtle Reveal */}
        <SectionWrapper delay={0.2} className="py-0">
          <LogoScroll />
        </SectionWrapper>

        {/* Core Features - Animated Bento Grid */}
        <SectionWrapper>
          <FeaturesSection />
        </SectionWrapper>

        {/* Dynamic Stats - Numbers that pop */}
        <SectionWrapper>
          <StatsSection />
        </SectionWrapper>

        {/* Pricing - High Contrast Highlight */}
        <SectionWrapper>
          <PricingSection />
        </SectionWrapper>
      </main>

      <Footer />
    </div>
  );
}

/**
 * SectionWrapper: Standardizes how sections enter the viewport
 * Features: Staggered Fade-in, Subtle Lift, and Viewport Trigger
 */
function SectionWrapper({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{
        duration: 0.8,
        delay: delay,
        ease: [0.21, 0.47, 0.32, 0.98] // Custom "ease-out" for premium feel
      }}
      className={className || "py-12 md:py-24"}
    >
      {children}
    </motion.section>
  );
}
