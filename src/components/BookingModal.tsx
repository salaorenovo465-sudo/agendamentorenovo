import React from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, User, Phone, CheckCircle, ChevronLeft, ChevronRight, ArrowRight, X } from 'lucide-react';
import { services } from '../data/services';
import BookingCalendar from './BookingCalendar';
import TimePicker from './TimePicker';

interface BookingData {
  service: string;
  servicePrice: string;
  date: string;
  time: string;
  name: string;
  phone: string;
}

interface BookingModalProps {
  isModalOpen: boolean;
  bookingData: BookingData;
  setBookingData: React.Dispatch<React.SetStateAction<BookingData>>;
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  currentMonthDate: Date;
  setCurrentMonthDate: React.Dispatch<React.SetStateAction<Date>>;
  bookedSlots: string[];
  isLoadingSlots: boolean;
  bookingSuccess: boolean;
  bookingError: string;
  isSubmitting: boolean;
  allServicesFlat: { name: string; price: string; desc: string; image: string }[];
  handleCloseModal: () => void;
  handleConfirmBooking: () => void;
}

export default function BookingModal({
  isModalOpen,
  bookingData,
  setBookingData,
  step,
  setStep,
  selectedCategory,
  setSelectedCategory,
  currentMonthDate,
  setCurrentMonthDate,
  bookedSlots,
  isLoadingSlots,
  bookingSuccess,
  bookingError,
  isSubmitting,
  allServicesFlat,
  handleCloseModal,
  handleConfirmBooking,
}: BookingModalProps) {
  if (!isModalOpen) return null;

  const isStep1Valid = bookingData.service && bookingData.date && bookingData.time;
  const isStep2Valid = bookingData.name.length > 2 && bookingData.phone.length > 8;

  return (
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
                <BookingCalendar
                  currentMonthDate={currentMonthDate}
                  setCurrentMonthDate={setCurrentMonthDate}
                  bookingData={bookingData}
                  setBookingData={setBookingData}
                />
              </div>

              {/* Section Divider */}
              <div className="section-divider"></div>

              {/* Time Selection */}
              <div className="space-y-3">
                <label className="text-xs tracking-widest uppercase text-luxury-muted font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 text-luxury-gold" /> Escolha o Horário
                </label>
                <TimePicker
                  bookingData={bookingData}
                  setBookingData={setBookingData}
                  bookedSlots={bookedSlots}
                  isLoadingSlots={isLoadingSlots}
                />
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

          {/* Success Screen */}
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
  );
}
