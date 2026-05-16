import React, { useState, useEffect } from 'react';
import { services as staticServices } from './data/services';
import HeroSection from './components/HeroSection';
import BookingModal from './components/BookingModal';
import { apiUrl } from './apiBase';

type ServiceCategory = {
  category: string;
  items: Array<{ name: string; price: string; desc?: string; durationMin?: number; image?: string }>;
};

type AvailabilityResponse = {
  busySlots: string[];
  availableSlots: string[];
  dateAvailable: boolean;
  limitReached?: boolean;
};

const emptyAvailability = (): AvailabilityResponse => ({
  busySlots: [],
  availableSlots: [],
  dateAvailable: false,
  limitReached: false,
});

const fetchAvailabilityForDate = async (dateStr: string): Promise<AvailabilityResponse> => {
  try {
    const response = await fetch(apiUrl(`/api/availability?date=${encodeURIComponent(dateStr)}`));
    if (!response.ok) {
      if (response.status === 500) return emptyAvailability(); // Possivelmente sem tokens ainda
      throw new Error('Falha ao buscar agenda');
    }
    const data = await response.json();
    return {
      busySlots: Array.isArray(data.busySlots) ? data.busySlots : [],
      availableSlots: Array.isArray(data.availableSlots) ? data.availableSlots : [],
      dateAvailable: data.dateAvailable === true,
      limitReached: data.limitReached === true,
    };
  } catch (error) {
    console.error('Erro na API de disponibilidade:', error);
    return emptyAvailability();
  }
};

const fetchServiceCatalog = async (): Promise<{ catalog: ServiceCategory[]; managed: boolean }> => {
  try {
    const response = await fetch(apiUrl('/api/services'));
    if (!response.ok) {
      return { catalog: [], managed: false };
    }
    const data = await response.json();
    return {
      catalog: Array.isArray(data.catalog) ? data.catalog : [],
      managed: data.managed === true,
    };
  } catch (error) {
    console.error('Erro ao carregar catalogo de servicos:', error);
    return { catalog: [], managed: false };
  }
};

const WHATSAPP_NUMBER = "5571999542265"; // Empresa Estúdio Renovo

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
  const [services, setServices] = useState<ServiceCategory[]>(staticServices as ServiceCategory[]);
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
    phone: "+55"
  });
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedDateAvailable, setSelectedDateAvailable] = useState(false);
  const [monthAvailability, setMonthAvailability] = useState<Record<string, boolean>>({});
  const [isLoadingMonthAvailability, setIsLoadingMonthAvailability] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch service catalog from backend (synced with admin panel)
  useEffect(() => {
    let active = true;
    fetchServiceCatalog().then(({ catalog, managed }) => {
      if (active && managed && catalog.length > 0) {
        setServices(catalog);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (bookingData.date) {
      setIsLoadingSlots(true);
      fetchAvailabilityForDate(bookingData.date).then((availability) => {
        if (active) {
          setBookedSlots(availability.busySlots);
          setAvailableSlots(availability.availableSlots);
          setSelectedDateAvailable(availability.dateAvailable);
          setIsLoadingSlots(false);
        }
      });
    } else {
      setBookedSlots([]);
      setAvailableSlots([]);
      setSelectedDateAvailable(false);
    }
    return () => { active = false; };
  }, [bookingData.date]);

  useEffect(() => {
    if (!isModalOpen) return;

    let active = true;
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dateObj = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { dateObj, dateStr };
    }).filter(({ dateObj }) => dateObj >= today && dateObj.getDay() !== 0);

    setIsLoadingMonthAvailability(true);
    Promise.all(dates.map(async ({ dateStr }) => {
      const availability = await fetchAvailabilityForDate(dateStr);
      return [dateStr, availability.dateAvailable] as const;
    })).then((entries) => {
      if (!active) return;
      setMonthAvailability(Object.fromEntries(entries));
      setIsLoadingMonthAvailability(false);
    }).catch(() => {
      if (!active) return;
      setMonthAvailability({});
      setIsLoadingMonthAvailability(false);
    });

    return () => { active = false; };
  }, [currentMonthDate, isModalOpen]);

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
      setBookingData({ service: "", servicePrice: "", selectedServices: [], date: "", time: "", name: "", phone: "+55" });
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
      selectionSummary.servicePrice || bookingData.servicePrice || services.flatMap(c => c.items).find(item => item.name === bookingData.service)?.price || 'Sob consulta';
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
        services={services}
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
        availableSlots={availableSlots}
        selectedDateAvailable={selectedDateAvailable}
        monthAvailability={monthAvailability}
        isLoadingMonthAvailability={isLoadingMonthAvailability}
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
