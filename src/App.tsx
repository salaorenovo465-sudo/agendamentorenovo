import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { MapPin, Phone, Instagram, ArrowRight, X, Calendar, Clock, User, CheckCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const fetchBookedSlotsForDate = async (dateStr: string): Promise<string[]> => {
  try {
    const response = await fetch(`${API_URL}/api/availability?date=${dateStr}`);
    if (!response.ok) {
      if (response.status === 500) return []; // Possivelmente sem tokens ainda
      throw new Error('Falha ao buscar agenda');
    }
    const data = await response.json();
    return data.busySlots || [];
  } catch (error) {
    console.error('Erro na API de disponibilidade:', error);
    return [];
  }
};

const WHATSAPP_NUMBER = "557183006283"; // Empresa Estúdio Renovo
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=Ol%C3%A1!%20Gostaria%20de%20fazer%20um%20agendamento%20no%20Est%C3%BAdio%20Renovo.`;

import { services, timeSlots } from './data/services';
const allServicesFlat = services.flatMap(c => c.items);

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState({
    service: "",
    servicePrice: "",
    date: "",
    time: "",
    name: "",
    phone: ""
  });
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (bookingData.date) {
      setIsLoadingSlots(true);
      fetchBookedSlotsForDate(bookingData.date).then(slots => {
        if (active) {
          setBookedSlots(slots);
          setIsLoadingSlots(false);
        }
      });
    } else {
      setBookedSlots([]);
    }
    return () => { active = false; };
  }, [bookingData.date]);

  const handleOpenCategoryModal = (categoryName = "") => {
    setSelectedCategory(categoryName);
    setBookingData(prev => ({ ...prev, service: "", servicePrice: "" }));
    setStep(1);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setStep(1);
      setSelectedCategory("");
      setBookingData({ service: "", servicePrice: "", date: "", time: "", name: "", phone: "" });
      setBookingSuccess(false);
      setIsSubmitting(false);
    }, 300);
  };

  const handleConfirmBooking = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setBookingError('');

    const selectedServicePrice =
      bookingData.servicePrice || allServicesFlat.find(item => item.name === bookingData.service)?.price || 'Sob consulta';

    try {
      const response = await fetch(`${API_URL}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bookingData, servicePrice: selectedServicePrice }),
      });

      if (!response.ok) {
        let errorMessage = 'Erro ao registrar agendamento.';

        try {
          const payload = await response.json();
          if (payload?.error && typeof payload.error === 'string') {
            errorMessage = payload.error;
          }
        } catch {
          // noop
        }

        throw new Error(errorMessage);
      }

      // Success — show confirmation screen (WhatsApp message sent automatically by backend)
      setBookingSuccess(true);
    } catch (error) {
      console.error('Erro ao gravar na agenda:', error);
      const msg = error instanceof Error ? error.message : 'Não foi possível registrar o agendamento agora. Tente novamente.';
      setBookingError(msg);
      setTimeout(() => setBookingError(''), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCalendar = () => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const today = new Date();
    today.setHours(0,0,0,0);

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const prevMonth = () => setCurrentMonthDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentMonthDate(new Date(year, month + 1, 1));

    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <div className="bg-luxury-light/80 rounded-2xl border border-luxury-dark/8 p-5">
        <div className="flex justify-between items-center mb-5">
          <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full border border-luxury-gold/30 hover:bg-luxury-gold/10 text-luxury-gold transition-all duration-300 cursor-pointer hover:border-luxury-gold">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-serif text-xl font-medium text-luxury-dark tracking-wide">
            {monthNames[month]} <span className="text-luxury-gold">{year}</span>
          </span>
          <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full border border-luxury-gold/30 hover:bg-luxury-gold/10 text-luxury-gold transition-all duration-300 cursor-pointer hover:border-luxury-gold">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-1 mb-3">
          {weekDays.map(day => (
            <div key={day} className="text-center text-[9px] tracking-[0.2em] uppercase text-luxury-muted/60 font-semibold py-1">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-x-1 gap-y-1.5">
          {blanks.map(blank => (
            <div key={`blank-${blank}`} className="p-2"></div>
          ))}
          {days.map(day => {
            const dateObj = new Date(year, month, day);
            const isPast = dateObj < today;
            const isToday = dateObj.getTime() === today.getTime();
            const isSunday = dateObj.getDay() === 0;
            const isUnavailable = isPast || isSunday;
            
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = bookingData.date === dateStr;

            return (
              <button
                key={day}
                type="button"
                disabled={isUnavailable}
                onClick={() => setBookingData({ ...bookingData, date: dateStr, time: '' })}
                className={`p-1.5 rounded-full text-sm flex flex-col items-center justify-center transition-all duration-300 ${
                  isSelected 
                    ? 'bg-luxury-gold text-white shadow-md shadow-luxury-gold/30 scale-105' 
                    : isUnavailable 
                      ? 'text-luxury-muted/20 cursor-not-allowed' 
                      : isToday
                        ? 'text-luxury-gold font-bold hover:bg-luxury-gold/15 cursor-pointer'
                        : 'text-luxury-dark hover:bg-luxury-gold/10 cursor-pointer'
                }`}
              >
                <div className="w-7 h-7 flex items-center justify-center">
                  {day}
                </div>
                {isToday && !isSelected && <div className="w-1 h-1 rounded-full bg-luxury-gold mt-[-2px]"></div>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const isStep1Valid = bookingData.service && bookingData.date && bookingData.time;
  const isStep2Valid = bookingData.name.length > 2 && bookingData.phone.length > 8;

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
          onClick={() => {
            setStep(1);
            setSelectedCategory('');
            setIsModalOpen(true);
          }}
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
          <a href="https://www.instagram.com/estudiorenovo" target="_blank" rel="noopener noreferrer" className="hover:text-luxury-gold/80 transition-colors duration-300">
            <Instagram className="w-4 h-4" />
          </a>
          <div className="dot-separator"></div>
          <a href={`tel:+${WHATSAPP_NUMBER}`} className="hover:text-luxury-gold/80 transition-colors duration-300">
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

      {/* Booking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md" 
            onClick={handleCloseModal}
          ></motion.div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative w-full max-w-2xl bg-luxury-white rounded-[2rem] shadow-[0_25px_100px_-12px_rgba(194,166,121,0.25)] overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Gold Accent Bar — assinatura de luxo */}
            <div className="gold-accent-bar"></div>

            {/* Modal Header — with subtle gold gradient */}
            <div className="relative flex items-center justify-between px-6 sm:px-8 py-5 sm:py-6 border-b border-luxury-gold/10">
              <div className="absolute inset-0 bg-gradient-to-r from-luxury-gold/5 via-transparent to-luxury-gold/5"></div>
              <div className="relative flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-luxury-gold/10 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-luxury-gold" />
                </div>
                <h3 className="font-serif text-xl sm:text-2xl text-luxury-dark">Agendar Horário</h3>
              </div>
              <button onClick={handleCloseModal} className="relative p-2 text-luxury-muted hover:text-luxury-dark transition-all rounded-full hover:bg-luxury-dark/5 hover:rotate-90 duration-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 overflow-y-auto flex-1 custom-scrollbar">
              
              {/* Step Indicators — refined with icons */}
              <div className="flex items-center justify-center gap-3 mb-10">
                <div className={`flex items-center gap-2.5 px-4 py-2 rounded-full transition-all duration-500 ${step >= 1 ? 'bg-luxury-gold/10' : 'bg-transparent'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-500 ${step >= 1 ? 'bg-luxury-gold text-white shadow-md shadow-luxury-gold/30' : 'bg-luxury-light text-luxury-muted border border-luxury-dark/10'}`}>
                    {step > 1 ? <CheckCircle className="w-3.5 h-3.5" /> : '1'}
                  </div>
                  <span className={`text-[10px] tracking-[0.15em] uppercase font-semibold hidden sm:block transition-colors duration-500 ${step >= 1 ? 'text-luxury-gold' : 'text-luxury-muted/50'}`}>Serviço & Data</span>
                </div>
                <div className={`w-8 h-[2px] rounded-full transition-all duration-700 ${step >= 2 ? 'bg-luxury-gold' : 'bg-luxury-dark/10'}`}></div>
                <div className={`flex items-center gap-2.5 px-4 py-2 rounded-full transition-all duration-500 ${step >= 2 ? 'bg-luxury-gold/10' : 'bg-transparent'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-500 ${step >= 2 ? 'bg-luxury-gold text-white shadow-md shadow-luxury-gold/30' : 'bg-luxury-light text-luxury-muted border border-dashed border-luxury-gold/30'}`}>2</div>
                  <span className={`text-[10px] tracking-[0.15em] uppercase font-semibold hidden sm:block transition-colors duration-500 ${step >= 2 ? 'text-luxury-gold' : 'text-luxury-muted/50'}`}>Seus Dados</span>
                </div>
              </div>

              {step === 1 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Sticky Header for Category/Service */}
                  <div className="sticky -top-8 -mx-8 px-8 py-5 bg-luxury-white/95 backdrop-blur-md z-20 border-b border-luxury-gold/10 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] space-y-0 mb-8 transition-all duration-300">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Category Selection */}
                      <div className="space-y-2">
                        <label className="text-[9px] tracking-[0.2em] uppercase text-luxury-muted font-bold flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-luxury-gold"></div> Categoria
                        </label>
                        <div className="relative group">
                           <select 
                             value={selectedCategory}
                             onChange={(e) => {
                               setSelectedCategory(e.target.value);
                               setBookingData({...bookingData, service: "", servicePrice: ""});
                             }}
                             className="w-full appearance-none bg-luxury-light/70 border border-luxury-dark/8 rounded-xl px-4 py-3 text-xs text-luxury-dark font-semibold focus:outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/10 transition-all cursor-pointer hover:border-luxury-gold/30 hover:shadow-sm"
                           >
                            <option value="" disabled>Escolha...</option>
                            {services.map((cat, i) => (
                              <option key={i} value={cat.category}>{cat.category}</option>
                            ))}
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-luxury-gold/60 group-hover:text-luxury-gold transition-colors">
                            <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                          </div>
                        </div>
                      </div>

                      {/* Sub-Service Dropdown */}
                      <div className="space-y-2">
                        <label className="text-[9px] tracking-[0.2em] uppercase text-luxury-muted font-bold flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedCategory ? 'bg-luxury-gold' : 'bg-luxury-muted/30'}`}></div> Serviço
                        </label>
                        <div className="relative group">
                          <select 
                            value={bookingData.service}
                            onChange={(e) => {
                              const serviceName = e.target.value;
                              const selectedService = services
                                .find(c => c.category === selectedCategory)
                                ?.items.find(item => item.name === serviceName);

                              setBookingData({
                                ...bookingData,
                                service: serviceName,
                                servicePrice: selectedService?.price || ''
                              });
                            }}
                            disabled={!selectedCategory}
                            className={`w-full appearance-none border rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none transition-all cursor-pointer ${
                              !selectedCategory 
                                ? 'bg-luxury-dark/3 border-luxury-dark/5 text-luxury-muted/40 cursor-not-allowed' 
                                : 'bg-luxury-light/70 border-luxury-dark/8 text-luxury-dark focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/10 hover:border-luxury-gold/30 hover:shadow-sm'
                            }`}
                          >
                            <option value="" disabled>{selectedCategory ? "Escolha..." : "---"}</option>
                            {selectedCategory && services.find(c => c.category === selectedCategory)?.items.map((item, j) => (
                              <option key={j} value={item.name}>{item.name} ({item.price})</option>
                            ))}
                          </select>
                          <div className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300 ${!selectedCategory ? 'opacity-10' : 'text-luxury-gold/60 group-hover:text-luxury-gold'}`}>
                            <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section Divider */}
                  <div className="section-divider"></div>

                  {/* Date Selection */}
                  <div className="space-y-3">
                    <label className="text-xs tracking-widest uppercase text-luxury-muted font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-luxury-gold" /> Escolha a Data
                    </label>
                    {renderCalendar()}
                  </div>

                  {/* Section Divider */}
                  <div className="section-divider"></div>

                  {/* Time Selection */}
                  <div className="space-y-3">
                    <label className="text-xs tracking-widest uppercase text-luxury-muted font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4 text-luxury-gold" /> Escolha o Horário
                    </label>
                    {bookingData.date ? (
                      isLoadingSlots ? (
                        <div className="py-10 flex flex-col items-center gap-3">
                          <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
                          <span className="text-[10px] tracking-widest uppercase text-luxury-muted">Consultando agenda...</span>
                        </div>
                      ) : (
                        <div className="relative w-full max-w-sm mx-auto py-8 px-4 bg-gradient-to-b from-[#F9F7F2] to-[#EBE4D5] rounded-[2.5rem] shadow-[inset_0_2px_10px_rgba(255,255,255,0.8),0_10px_30px_rgba(0,0,0,0.05)] border border-white/60 overflow-hidden">
                          {/* Highlight bar in the middle */}
                          <div className="absolute top-1/2 left-6 right-6 h-[4.5rem] -translate-y-1/2 bg-white/70 backdrop-blur-md rounded-2xl border border-luxury-gold/30 shadow-[0_4px_15px_rgba(212,175,55,0.1)] pointer-events-none z-0"></div>
                          
                          <div className="flex items-center justify-center gap-8 relative z-10">
                            {/* Coluna de Horas */}
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] uppercase tracking-[0.25em] text-luxury-dark/50 mb-4 font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3 text-luxury-gold" /> Hora
                              </span>
                              <div className="h-48 w-16 overflow-y-auto snap-y snap-mandatory relative [mask-image:linear-gradient(to_bottom,transparent,black_35%,black_65%,transparent)] [&::-webkit-scrollbar]:hidden selection-roleta" style={{ scrollbarWidth: 'none' }}>
                                 <div className="h-[4.5rem] w-full snap-center"></div> {/* Spacer */}
                                 {Array.from({length: 13}, (_, i) => String(i + 8).padStart(2, '0')).map(hour => {
                                   const currentMinute = bookingData.time.split(':')[1] || '00';
                                   const isSelected = bookingData.time.startsWith(`${hour}:`);
                                   return (
                                     <button type="button" key={hour} onClick={() => setBookingData({...bookingData, time: `${hour}:${currentMinute}`})} className={`snap-center h-[4.5rem] w-full flex items-center justify-center text-[2.5rem] transition-all duration-300 ${isSelected ? 'text-luxury-dark font-medium scale-110 tracking-tight' : 'text-luxury-dark font-light opacity-30 scale-75 hover:opacity-60'}`}>
                                       {hour}
                                     </button>
                                   );
                                 })}
                                 <div className="h-[4.5rem] w-full snap-center"></div> {/* Spacer */}
                                 <div className="h-[4.5rem] w-full snap-center"></div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-center justify-center mt-8 h-48 pointer-events-none">
                              <span className="text-4xl font-light text-luxury-gold/50 pb-2 animate-pulse">:</span>
                            </div>

                            {/* Coluna de Minutos */}
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] uppercase tracking-[0.25em] text-luxury-dark/50 mb-4 font-bold">Min</span>
                              <div className="h-48 w-16 overflow-y-auto snap-y snap-mandatory relative [mask-image:linear-gradient(to_bottom,transparent,black_35%,black_65%,transparent)] [&::-webkit-scrollbar]:hidden selection-roleta" style={{ scrollbarWidth: 'none' }}>
                                 <div className="h-[4.5rem] w-full snap-center"></div> {/* Spacer */}
                                 {['00', '20', '40'].map(minute => {
                                   const currentHour = bookingData.time.split(':')[0] || '09';
                                   const isSelected = bookingData.time.endsWith(`:${minute}`);
                                   
                                   const comboTime = `${currentHour}:${minute}`;
                                   const isBooked = bookedSlots.includes(comboTime);
                                   
                                   return (
                                     <button type="button" disabled={isBooked} key={minute} onClick={() => setBookingData({...bookingData, time: `${currentHour}:${minute}`})} className={`snap-center h-[4.5rem] w-full flex items-center justify-center text-[2.5rem] transition-all duration-300 relative ${isBooked ? 'text-red-900/10 font-thin cursor-not-allowed line-through scale-75' : isSelected ? 'text-luxury-dark font-medium scale-110 tracking-tight' : 'text-luxury-dark font-light opacity-30 scale-75 hover:opacity-60'}`}>
                                       {minute}
                                     </button>
                                   );
                                 })}
                                 <div className="h-[4.5rem] w-full snap-center"></div> {/* Spacer */}
                                 <div className="h-[4.5rem] w-full snap-center"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="py-6 text-center text-sm font-medium text-luxury-muted/60 bg-luxury-light/30 rounded-xl border border-dashed border-luxury-dark/8">
                        <Calendar className="w-5 h-5 mx-auto mb-2 text-luxury-gold/40" />
                        Selecione uma data acima
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 2 && !bookingSuccess && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">

                  {/* Summary Card — premium */}
                  <div className="bg-gradient-to-br from-luxury-gold/8 to-luxury-gold/3 p-6 rounded-2xl border border-luxury-gold/15 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-luxury-gold/5 rounded-full -mr-20 -mt-20 transition-transform group-hover:scale-125 duration-1000"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-luxury-gold/5 rounded-full -ml-12 -mb-12"></div>
                    <h4 className="font-serif text-xl text-luxury-dark mb-5 relative z-10 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-luxury-gold" />
                      Resumo do Momento
                    </h4>
                    <ul className="space-y-3.5 text-sm relative z-10">
                      <li className="flex justify-between items-center border-b border-luxury-gold/10 pb-3.5">
                        <span className="text-luxury-muted font-semibold uppercase tracking-[0.15em] text-[10px] flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-luxury-gold inline-block"></span> Serviço
                        </span>
                        <span className="font-bold text-luxury-dark text-right max-w-[200px]">{bookingData.service}</span>
                      </li>
                      <li className="flex justify-between items-center border-b border-luxury-gold/10 pb-3.5">
                        <span className="text-luxury-muted font-semibold uppercase tracking-[0.15em] text-[10px] flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-luxury-gold inline-block"></span> Data
                        </span>
                        <span className="font-bold text-luxury-dark">{bookingData.date.split('-').reverse().join('/')}</span>
                      </li>
                      <li className="flex justify-between items-center border-b border-luxury-gold/10 pb-3.5">
                        <span className="text-luxury-muted font-semibold uppercase tracking-[0.15em] text-[10px] flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-luxury-gold inline-block"></span> Valor
                        </span>
                        <span className="font-bold text-luxury-dark">{bookingData.servicePrice || allServicesFlat.find(item => item.name === bookingData.service)?.price || 'Sob consulta'}</span>
                      </li>
                      <li className="flex justify-between items-center">
                        <span className="text-luxury-muted font-semibold uppercase tracking-[0.15em] text-[10px] flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-luxury-gold inline-block"></span> Horário
                        </span>
                        <span className="font-bold text-luxury-gold text-base">{bookingData.time}</span>
                      </li>
                    </ul>
                  </div>

                  {/* Personal Info — refined inputs */}
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs tracking-widest uppercase text-luxury-muted font-medium flex items-center gap-2">
                        <User className="w-4 h-4 text-luxury-gold" /> Seu Nome
                      </label>
                      <input
                        type="text"
                        placeholder="Como gostaria de ser chamada(o)?"
                        value={bookingData.name}
                        onChange={(e) => setBookingData({...bookingData, name: e.target.value})}
                        className="w-full bg-transparent border-b-2 border-luxury-dark/10 px-0 py-3 text-luxury-dark text-lg font-medium placeholder:text-luxury-muted/30 placeholder:font-light focus:outline-none focus:border-luxury-gold transition-all duration-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs tracking-widest uppercase text-luxury-muted font-medium flex items-center gap-2">
                        <Phone className="w-4 h-4 text-luxury-gold" /> Seu WhatsApp
                      </label>
                      <input
                        type="tel"
                        placeholder="(71) 90000-0000"
                        value={bookingData.phone}
                        onChange={(e) => setBookingData({...bookingData, phone: e.target.value})}
                        className="w-full bg-transparent border-b-2 border-luxury-dark/10 px-0 py-3 text-luxury-dark text-lg font-medium placeholder:text-luxury-muted/30 placeholder:font-light focus:outline-none focus:border-luxury-gold transition-all duration-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ══ Success Screen ══ */}
              {bookingSuccess && (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-700 text-center py-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-luxury-gold/20 to-luxury-gold/5 flex items-center justify-center border-2 border-luxury-gold/30">
                    <CheckCircle className="w-10 h-10 text-luxury-gold" />
                  </div>
                  <div>
                    <h3 className="font-serif text-2xl text-luxury-dark mb-2">Agendamento Enviado!</h3>
                    <p className="text-luxury-muted text-sm leading-relaxed max-w-sm mx-auto">
                      Seu pedido foi recebido com sucesso. Enviamos uma confirmação no seu WhatsApp. ✨
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-luxury-gold/8 to-luxury-gold/3 p-5 rounded-2xl border border-luxury-gold/15 text-left max-w-sm mx-auto">
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-luxury-muted text-xs uppercase tracking-widest">Serviço</span>
                        <span className="font-semibold text-luxury-dark text-right max-w-[180px]">{bookingData.service}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-luxury-muted text-xs uppercase tracking-widest">Data</span>
                        <span className="font-semibold text-luxury-dark">{bookingData.date.split('-').reverse().join('/')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-luxury-muted text-xs uppercase tracking-widest">Horário</span>
                        <span className="font-bold text-luxury-gold">{bookingData.time}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-luxury-light/60 rounded-xl p-4 max-w-sm mx-auto">
                    <p className="text-xs text-luxury-muted leading-relaxed">
                      📋 <strong>Status:</strong> Aguardando confirmação da nossa equipe.<br />
                      Você receberá uma mensagem no WhatsApp assim que confirmarmos! 💖<br />
                      <em>Caso precise cancelar, envie "cancelar" no WhatsApp.</em>
                    </p>
                  </div>

                  <button
                    onClick={handleCloseModal}
                    className="btn-shimmer inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-xs tracking-[0.15em] uppercase font-semibold bg-luxury-dark text-luxury-light hover:bg-luxury-gold shadow-lg shadow-luxury-dark/15 cursor-pointer hover:shadow-luxury-gold/25 transition-all duration-500"
                  >
                    Voltar ao Início <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

            </div>

            {/* Modal Footer — elevated */}
            {!bookingSuccess && (
            <div className="px-6 py-5 border-t border-luxury-gold/10 bg-gradient-to-r from-luxury-light/80 via-luxury-white to-luxury-light/80 flex justify-between items-center flex-wrap gap-3">
              {step === 2 ? (
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase font-medium text-luxury-muted hover:text-luxury-dark transition-all px-4 py-2.5 rounded-full hover:bg-luxury-dark/5 duration-300"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                </button>
              ) : (
                <div></div>
              )}

              {step === 1 ? (
                <button
                  onClick={() => setStep(2)}
                  disabled={!isStep1Valid}
                  className={`btn-shimmer inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-xs tracking-[0.15em] uppercase font-semibold transition-all duration-500 ${
                    isStep1Valid
                      ? 'bg-luxury-dark text-luxury-light hover:bg-luxury-gold shadow-lg shadow-luxury-dark/15 cursor-pointer hover:shadow-luxury-gold/25 pulse-cta'
                      : 'bg-luxury-dark/8 text-luxury-muted/50 cursor-not-allowed'
                  }`}
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleConfirmBooking}
                  disabled={!isStep2Valid || isSubmitting}
                  className={`btn-shimmer inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-xs tracking-[0.15em] uppercase font-semibold transition-all duration-500 ${
                    isStep2Valid && !isSubmitting
                      ? 'bg-luxury-gold text-white hover:bg-luxury-dark shadow-lg shadow-luxury-gold/30 cursor-pointer hover:shadow-luxury-dark/20'
                      : 'bg-luxury-dark/8 text-luxury-muted/50 cursor-not-allowed'
                  }`}
                >
                  {isSubmitting ? 'Enviando...' : 'Confirmar Agendamento'} <CheckCircle className="w-4 h-4" />
                </button>
              )}
              {bookingError && (
                <div className="w-full px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {bookingError}
                </div>
              )}
            </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
