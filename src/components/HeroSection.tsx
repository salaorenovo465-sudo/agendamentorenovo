import React from 'react';
import { motion } from 'motion/react';
import { MapPin, Phone, Instagram, ArrowRight } from 'lucide-react';

interface HeroSectionProps {
  whatsappNumber: string;
  onOpenBooking: () => void;
}

export default function HeroSection({ whatsappNumber, onOpenBooking }: HeroSectionProps) {
  return (
    <div className="relative min-h-screen bg-[#1a1510] text-luxury-dark selection:bg-luxury-gold selection:text-white flex flex-col items-center justify-center overflow-hidden">
      {/* Radial Gradient Background matching logo tones */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#3a2e1a_0%,_#1a1510_60%,_#0d0b08_100%)]"></div>
        {/* Subtle warm accent glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-luxury-gold/8 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0d0b08] to-transparent"></div>
      </div>

      {/* Noise Texture Overlay */}
      <div className="noise-overlay"></div>

      {/* Floating Particles */}
      <div className="absolute inset-0 pointer-events-none z-[1]">
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center px-6 w-full">

        {/* Floating Logo with Ornament Rings */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="relative mb-8"
        >
          {/* Ornament ring 1 — slow rotation */}
          <div className="ornament-ring absolute -inset-6 sm:-inset-8"></div>
          {/* Ornament ring 2 — reverse rotation */}
          <div className="ornament-ring absolute -inset-12 sm:-inset-14" style={{ animationDirection: 'reverse', animationDuration: '40s' }}></div>

          {/* Glow ring behind logo */}
          <div className="absolute inset-0 -m-4 rounded-full bg-luxury-gold/10 blur-2xl animate-pulse-ring"></div>
          <img
            src="/logo.jpg"
            alt="Estúdio Renovo"
            className="w-48 h-48 sm:w-64 sm:h-64 rounded-full object-cover shadow-2xl shadow-luxury-gold/20 border-2 border-luxury-gold/20 animate-float"
          />
        </motion.div>

        {/* Shimmer Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="text-center mb-6"
        >
          <p className="shimmer-text text-sm sm:text-base tracking-[0.3em] uppercase font-semibold">
            Beleza & Transformação
          </p>
        </motion.div>

        {/* Luxury Divider with diamond endpoints */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="luxury-divider mb-8"
        ></motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="text-luxury-gold/60 text-xs sm:text-sm tracking-widest text-center mb-12 max-w-xs font-light"
        >
          Seu momento de renovação começa aqui
        </motion.p>

        {/* CTA Button with inner shimmer */}
        <motion.button
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.2, type: "spring", stiffness: 120, damping: 14 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenBooking}
          className="btn-shimmer group w-full max-w-sm sm:w-auto inline-flex justify-center items-center gap-4 px-10 sm:px-14 py-5 sm:py-6 rounded-full bg-luxury-gold/90 text-white font-bold uppercase tracking-[0.2em] text-xs sm:text-sm hover:bg-luxury-gold transition-all duration-500 cursor-pointer shadow-[0_0_40px_rgba(194,166,121,0.3)] hover:shadow-[0_0_60px_rgba(194,166,121,0.5)]"
        >
          Agende o Seu Momento
          <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-2 transition-transform duration-300" />
        </motion.button>

        {/* Contact info with dot separators */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8, duration: 1 }}
          className="flex items-center gap-4 mt-16 text-luxury-gold/30"
        >
          <a href="https://www.instagram.com/estudio_renovo?igsh=MTUyNGU4dnF1OXVoMA==" target="_blank" rel="noopener noreferrer" className="hover:text-luxury-gold/80 transition-colors duration-300">
            <Instagram className="w-4 h-4" />
          </a>
          <div className="dot-separator"></div>
          <a href={`tel:+${whatsappNumber}`} className="hover:text-luxury-gold/80 transition-colors duration-300">
            <Phone className="w-4 h-4" />
          </a>
          <div className="dot-separator"></div>
          <span className="text-[10px] tracking-widest uppercase font-light">Salvador, BA</span>
          <div className="dot-separator"></div>
          <a href="https://maps.google.com/?q=Estudio+Renovo+Salvador+BA" target="_blank" rel="noopener noreferrer" className="hover:text-luxury-gold/80 transition-colors duration-300">
            <MapPin className="w-4 h-4" />
          </a>
        </motion.div>
      </div>
    </div>
  );
}
