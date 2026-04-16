import React, { useState, useEffect } from 'react';
import { services } from './data/services';
import HeroSection from './components/HeroSection';
import BookingModal from './components/BookingModal';
import { apiUrl } from './apiBase';

const fetchBookedSlotsForDate = async (dateStr: string): Promise<string[]> => {
  try {
    const response = await fetch(apiUrl(`/api/availability?date=${encodeURIComponent(dateStr)}`));
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

const WHATSAPP_NUMBER = "5571999542265"; // Empresa Estúdio Renovo

const allServicesFlat = services.flatMap(c => c.items);

type SelectedBookingService = {
  category: string;
  name: string;
  price: string;
};

type BookingData = {
  service: string;
  servicePrice: string;
  selectedServices: SelectedBookingService[];
  date: string;
  time: string;
  name: string;
  phone: string;
};

const parseServiceAmount = (price: string): number => {
  const match = price.match(/[\d.]+(?:,\d{2})?|\d+(?:\.\d{2})?/);
  if (!match) return 0;
  return Number(match[0].replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;
};

const summarizeServiceSelection = (selectedServices: SelectedBookingService[]): { service: string; servicePrice: string } => {
  if (selectedServices.length === 0) {
    return { service: '', servicePrice: '' };
  }

  const service = selectedServices.map((item) => item.name).join(' + ');
  const total = selectedServices.reduce((sum, item) => sum + parseServiceAmount(item.price), 0);
  const hasConsult = selectedServices.some((item) => item.price.toLowerCase().includes('sob consulta') || parseServiceAmount(item.price) === 0);
  const totalLabel = total > 0
    ? `Total estimado ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    : 'Sob consulta';

  return {
    service,
    servicePrice: hasConsult && total > 0 ? `${totalLabel} + itens sob consulta` : totalLabel,
  };
};

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState<BookingData>({
    service: "",
    servicePrice: "",
    selectedServices: [],
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

  const handleOpenBooking = () => {
    setStep(1);
    setSelectedCategory('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setStep(1);
      setSelectedCategory("");
      setBookingData({ service: "", servicePrice: "", selectedServices: [], date: "", time: "", name: "", phone: "" });
      setBookingSuccess(false);
      setIsSubmitting(false);
    }, 300);
  };

  const handleConfirmBooking = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setBookingError('');

    const selectionSummary = summarizeServiceSelection(bookingData.selectedServices);
    const selectedServicePrice =
      selectionSummary.servicePrice || bookingData.servicePrice || allServicesFlat.find(item => item.name === bookingData.service)?.price || 'Sob consulta';
    const selectedServiceName = selectionSummary.service || bookingData.service;

    try {
      const response = await fetch(apiUrl('/api/bookings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bookingData,
          service: selectedServiceName,
          servicePrice: selectedServicePrice,
          serviceItems: bookingData.selectedServices,
        }),
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
      const isNetworkError = error instanceof TypeError && /failed to fetch/i.test(error.message);
      const msg = isNetworkError
        ? 'Não foi possível conectar ao servidor de agendamento. Tente novamente em instantes.'
        : error instanceof Error
          ? error.message
          : 'Não foi possível registrar o agendamento agora. Tente novamente.';
      setBookingError(msg);
      setTimeout(() => setBookingError(''), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <HeroSection
        whatsappNumber={WHATSAPP_NUMBER}
        onOpenBooking={handleOpenBooking}
      />

      <BookingModal
        isModalOpen={isModalOpen}
        bookingData={bookingData}
        setBookingData={setBookingData}
        step={step}
        setStep={setStep}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        currentMonthDate={currentMonthDate}
        setCurrentMonthDate={setCurrentMonthDate}
        bookedSlots={bookedSlots}
        isLoadingSlots={isLoadingSlots}
        bookingSuccess={bookingSuccess}
        bookingError={bookingError}
        isSubmitting={isSubmitting}
        handleCloseModal={handleCloseModal}
        handleConfirmBooking={handleConfirmBooking}
      />
    </>
  );
}
