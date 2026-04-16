import React from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, User, Phone, CheckCircle, ChevronLeft, ChevronRight, ArrowRight, X } from 'lucide-react';
import { services } from '../data/services';
import BookingCalendar from './BookingCalendar';
import TimePicker from './TimePicker';

type SelectedBookingService = {
  category: string;
  name: string;
  price: string;
};

interface BookingData {
  service: string;
  servicePrice: string;
  selectedServices: SelectedBookingService[];
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
  handleCloseModal: () => void;
  handleConfirmBooking: () => void;
}

const parseServiceAmount = (price: string): number => {
  const match = price.match(/[\d.]+(?:,\d{2})?|\d+(?:\.\d{2})?/);
  if (!match) return 0;
  return Number(match[0].replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;
};

const summarizeSelectedServices = (selectedServices: SelectedBookingService[]): { service: string; servicePrice: string; countLabel: string } => {
  if (selectedServices.length === 0) {
    return { service: '', servicePrice: '', countLabel: 'Nenhum servico selecionado' };
  }

  const total = selectedServices.reduce((sum, item) => sum + parseServiceAmount(item.price), 0);
  const hasConsult = selectedServices.some((item) => item.price.toLowerCase().includes('sob consulta') || parseServiceAmount(item.price) === 0);
  const totalLabel = total > 0
    ? `Total estimado ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    : 'Sob consulta';

  return {
    service: selectedServices.map((item) => item.name).join(' + '),
    servicePrice: hasConsult && total > 0 ? `${totalLabel} + itens sob consulta` : totalLabel,
    countLabel: `${selectedServices.length} ${selectedServices.length === 1 ? 'servico' : 'servicos'} selecionado${selectedServices.length === 1 ? '' : 's'}`,
  };
};

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
  handleCloseModal,
  handleConfirmBooking,
}: BookingModalProps) {
  if (!isModalOpen) return null;

  const selectedServices = bookingData.selectedServices || [];
  const serviceSummary = summarizeSelectedServices(selectedServices);
  const isStep1Valid = selectedServices.length > 0 && bookingData.date && bookingData.time;
  const isStep2Valid = bookingData.name.length > 2 && bookingData.phone.length > 8;
  const currentCategoryServices = services.find(c => c.category === selectedCategory)?.items || [];

  const toggleService = (service: { name: string; price: string }) => {
    if (!selectedCategory) return;

    const exists = selectedServices.some((item) => item.name === service.name);
    const nextServices = exists
      ? selectedServices.filter((item) => item.name !== service.name)
      : [...selectedServices, { category: selectedCategory, name: service.name, price: service.price }];
    const nextSummary = summarizeSelectedServices(nextServices);

    setBookingData({
      ...bookingData,
      selectedServices: nextServices,
      service: nextSummary.service,
      servicePrice: nextSummary.servicePrice,
    });
  };

  const removeSelectedService = (serviceName: string) => {
    const nextServices = selectedServices.filter((item) => item.name !== serviceName);
    const nextSummary = summarizeSelectedServices(nextServices);

    setBookingData({
      ...bookingData,
      selectedServices: nextServices,
      service: nextSummary.service,
      servicePrice: nextSummary.servicePrice,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/75 backdrop-blur-lg"
        onClick={handleCloseModal}
      ></motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="booking-modal-shell relative w-full bg-luxury-white shadow-[0_25px_100px_-12px_rgba(194,166,121,0.25)] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Gold Accent Bar â€” assinatura de luxo */}
        <div className="gold-accent-bar"></div>

        {/* Modal Header â€” with subtle gold gradient */}
        <div className="booking-modal-header relative flex items-center justify-between px-5 sm:px-8 py-4 sm:py-6 border-b border-luxury-gold/10">
          <div className="absolute inset-0 bg-gradient-to-r from-luxury-gold/5 via-transparent to-luxury-gold/5"></div>
          <div className="relative flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-luxury-gold/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-luxury-gold" />
            </div>
            <h3 className="font-serif text-xl sm:text-2xl text-luxury-dark">Agendar HorÃ¡rio</h3>
          </div>
          <button onClick={handleCloseModal} className="relative p-2 text-luxury-muted hover:text-luxury-dark transition-all rounded-full hover:bg-luxury-dark/5 hover:rotate-90 duration-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="booking-modal-body overflow-y-auto flex-1 custom-scrollbar">

          {/* Step Indicators â€” refined with icons */}
          <div className="booking-stepper flex items-center justify-center gap-3">
            <div className={`flex items-center gap-2.5 px-4 py-2 rounded-full transition-all duration-500 ${step >= 1 ? 'bg-luxury-gold/10' : 'bg-transparent'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-500 ${step >= 1 ? 'bg-luxury-gold text-white shadow-md shadow-luxury-gold/30' : 'bg-luxury-light text-luxury-muted border border-luxury-dark/10'}`}>
                {step > 1 ? <CheckCircle className="w-3.5 h-3.5" /> : '1'}
              </div>
              <span className={`text-[10px] tracking-[0.15em] uppercase font-semibold hidden sm:block transition-colors duration-500 ${step >= 1 ? 'text-luxury-gold' : 'text-luxury-muted/50'}`}>ServiÃ§o & Data</span>
            </div>
            <div className={`w-8 h-[2px] rounded-full transition-all duration-700 ${step >= 2 ? 'bg-luxury-gold' : 'bg-luxury-dark/10'}`}></div>
            <div className={`flex items-center gap-2.5 px-4 py-2 rounded-full transition-all duration-500 ${step >= 2 ? 'bg-luxury-gold/10' : 'bg-transparent'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-500 ${step >= 2 ? 'bg-luxury-gold text-white shadow-md shadow-luxury-gold/30' : 'bg-luxury-light text-luxury-muted border border-dashed border-luxury-gold/30'}`}>2</div>
              <span className={`text-[10px] tracking-[0.15em] uppercase font-semibold hidden sm:block transition-colors duration-500 ${step >= 2 ? 'text-luxury-gold' : 'text-luxury-muted/50'}`}>Seus Dados</span>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Sticky Header for Category/Service */}
              <div className="booking-service-panel sticky top-0 bg-luxury-white/95 backdrop-blur-md z-20 border border-luxury-gold/10 shadow-[0_12px_40px_-24px_rgba(28,24,21,0.25)] transition-all duration-300">
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

                  {/* Multi-service summary */}
                  <div className="space-y-2">
                    <label className="text-[9px] tracking-[0.2em] uppercase text-luxury-muted font-bold flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selectedServices.length ? 'bg-luxury-gold' : 'bg-luxury-muted/30'}`}></div> Servicos
                    </label>
                    <div className="booking-multi-summary">
                      <strong>{serviceSummary.countLabel}</strong>
                      <span>{serviceSummary.servicePrice || 'Escolha um ou mais servicos'}</span>
                    </div>
                  </div>
                </div>

                <div className="booking-service-picker">
                  {selectedCategory ? (
                    currentCategoryServices.map((item) => {
                      const isSelected = selectedServices.some((service) => service.name === item.name);
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => toggleService(item)}
                          className={`booking-service-option ${isSelected ? 'active' : ''}`}
                        >
                          <span>{item.name}</span>
                          <small>{item.price}</small>
                          <CheckCircle className={`w-4 h-4 ${isSelected ? 'opacity-100' : 'opacity-20'}`} />
                        </button>
                      );
                    })
                  ) : (
                    <div className="booking-service-empty">Escolha uma categoria para adicionar um ou mais servicos.</div>
                  )}
                </div>

                {selectedServices.length > 0 && (
                  <div className="booking-selected-services">
                    {selectedServices.map((service) => (
                      <button key={service.name} type="button" onClick={() => removeSelectedService(service.name)}>
                        <span>{service.name}</span>
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                )}
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
                  <Clock className="w-4 h-4 text-luxury-gold" /> Escolha o HorÃ¡rio
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

              {/* Summary Card â€” premium */}
              <div className="booking-summary-card bg-gradient-to-br from-luxury-gold/8 to-luxury-gold/3 p-5 sm:p-6 border border-luxury-gold/15 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-40 h-40 bg-luxury-gold/5 rounded-full -mr-20 -mt-20 transition-transform group-hover:scale-125 duration-1000"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-luxury-gold/5 rounded-full -ml-12 -mb-12"></div>
                <h4 className="font-serif text-xl text-luxury-dark mb-5 relative z-10 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-luxury-gold" />
                  Resumo do Momento
                </h4>
                <ul className="space-y-3.5 text-sm relative z-10">
                  <li className="flex justify-between items-center border-b border-luxury-gold/10 pb-3.5">
                    <span className="text-luxury-muted font-semibold uppercase tracking-[0.15em] text-[10px] flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-luxury-gold inline-block"></span> ServiÃ§o
                    </span>
                    <span className="font-bold text-luxury-dark text-right max-w-[240px]">{serviceSummary.service}</span>
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
                    <span className="font-bold text-luxury-dark text-right">{serviceSummary.servicePrice || 'Sob consulta'}</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span className="text-luxury-muted font-semibold uppercase tracking-[0.15em] text-[10px] flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-luxury-gold inline-block"></span> HorÃ¡rio
                    </span>
                    <span className="font-bold text-luxury-gold text-base">{bookingData.time}</span>
                  </li>
                </ul>
              </div>

              {/* Personal Info â€” refined inputs */}
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
                  Seu pedido foi recebido com sucesso. Enviamos uma confirmaÃ§Ã£o no seu WhatsApp. âœ¨
                </p>
              </div>

              <div className="booking-summary-card bg-gradient-to-br from-luxury-gold/8 to-luxury-gold/3 p-5 border border-luxury-gold/15 text-left max-w-sm mx-auto">
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-luxury-muted text-xs uppercase tracking-widest">ServiÃ§o</span>
                    <span className="font-semibold text-luxury-dark text-right max-w-[220px]">{serviceSummary.service}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-luxury-muted text-xs uppercase tracking-widest">Data</span>
                    <span className="font-semibold text-luxury-dark">{bookingData.date.split('-').reverse().join('/')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-luxury-muted text-xs uppercase tracking-widest">HorÃ¡rio</span>
                    <span className="font-bold text-luxury-gold">{bookingData.time}</span>
                  </div>
                </div>
              </div>

              <div className="bg-luxury-light/60 rounded-xl p-4 max-w-sm mx-auto">
                <p className="text-xs text-luxury-muted leading-relaxed">
                  ðŸ“‹ <strong>Status:</strong> Aguardando confirmaÃ§Ã£o da nossa equipe.<br />
                  VocÃª receberÃ¡ uma mensagem no WhatsApp assim que confirmarmos! ðŸ’–<br />
                  <em>Caso precise cancelar, envie "cancelar" no WhatsApp.</em>
                </p>
              </div>

              <button
                onClick={handleCloseModal}
                className="btn-shimmer inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-xs tracking-[0.15em] uppercase font-semibold bg-luxury-dark text-luxury-light hover:bg-luxury-gold shadow-lg shadow-luxury-dark/15 cursor-pointer hover:shadow-luxury-gold/25 transition-all duration-500"
              >
                Voltar ao InÃ­cio <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>

        {/* Modal Footer â€” elevated */}
        {!bookingSuccess && (
        <div className="booking-modal-footer px-5 sm:px-6 py-4 sm:py-5 border-t border-luxury-gold/10 bg-gradient-to-r from-luxury-light/80 via-luxury-white to-luxury-light/80 flex justify-between items-center flex-wrap gap-3">
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
              className={`btn-shimmer inline-flex items-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-lg text-xs tracking-[0.15em] uppercase font-semibold transition-all duration-500 ${
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
              className={`btn-shimmer inline-flex items-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-lg text-xs tracking-[0.15em] uppercase font-semibold transition-all duration-500 ${
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
