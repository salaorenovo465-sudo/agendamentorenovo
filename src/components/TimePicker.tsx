import React, { useEffect, useState } from 'react';
import { Clock, Calendar, Loader2 } from 'lucide-react';

interface BookingData {
  service: string;
  servicePrice: string;
  selectedServices: { category: string; name: string; price: string }[];
  date: string;
  time: string;
  name: string;
  phone: string;
}

interface TimePickerProps {
  bookingData: BookingData;
  setBookingData: React.Dispatch<React.SetStateAction<BookingData>>;
  bookedSlots: string[];
  isLoadingSlots: boolean;
}

const HOURS = Array.from({ length: 13 }, (_, i) => String(i + 8).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const parseTimeParts = (time: string): { hour: string; minute: string } => {
  const [rawHour, rawMinute] = time.split(':');

  return {
    hour: rawHour || '09',
    minute: rawMinute || '00',
  };
};

const toMinuteSlot = (time: string): string => time.split(':').slice(0, 2).join(':');

export default function TimePicker({ bookingData, setBookingData, bookedSlots, isLoadingSlots }: TimePickerProps) {
  const [selectedHour, setSelectedHour] = useState<string>('');

  useEffect(() => {
    setSelectedHour('');
  }, [bookingData.date]);

  useEffect(() => {
    if (bookingData.time) {
      setSelectedHour(parseTimeParts(bookingData.time).hour);
    }
  }, [bookingData.time]);

  if (!bookingData.date) {
    return (
      <div className="py-6 text-center text-sm font-medium text-luxury-muted/60 bg-luxury-light/30 rounded-lg border border-dashed border-luxury-dark/8">
        <Calendar className="w-5 h-5 mx-auto mb-2 text-luxury-gold/40" />
        Selecione uma data acima
      </div>
    );
  }

  if (isLoadingSlots) {
    return (
      <div className="py-10 flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
        <span className="text-[10px] tracking-widest uppercase text-luxury-muted">Consultando agenda...</span>
      </div>
    );
  }

  const selectedTime = parseTimeParts(bookingData.time);
  const activeHour = selectedHour || selectedTime.hour;
  const selectedMinuteSlot = `${activeHour}:${selectedTime.minute}`;
  const isSelectedMinuteBooked = bookedSlots.includes('all') || bookedSlots.some((slot) => toMinuteSlot(slot) === selectedMinuteSlot);

  const chooseHour = (hour: string) => {
    setSelectedHour(hour);
    setBookingData((current) => {
      return {
        ...current,
        time: '',
      };
    });
  };

  const chooseMinute = (minute: string) => {
    if (!activeHour) return;
    setBookingData((current) => ({
      ...current,
      time: `${activeHour}:${minute}`,
    }));
  };

  const changeHour = () => {
    setSelectedHour('');
    setBookingData((current) => ({ ...current, time: '' }));
  };

  return (
    <div className="booking-time-panel bg-luxury-light/80 border border-luxury-dark/8 p-3 sm:p-5">
      <div className="booking-time-summary">
        <div>
          <span>Horario selecionado</span>
          <strong>{bookingData.time || (selectedHour ? `${selectedHour}:--` : '--:--')}</strong>
        </div>
        {bookingData.time && isSelectedMinuteBooked && (
          <small>Este minuto ja esta ocupado. Escolha outro horario.</small>
        )}
      </div>

      <div className={`booking-time-stage-card ${selectedHour ? 'booking-time-stage-card-compact' : ''}`}>
      <div className="booking-time-grid-label">
          <Clock className="w-3.5 h-3.5 text-luxury-gold" />
          <span>Hora</span>
          {selectedHour && (
            <button type="button" onClick={changeHour}>
              Trocar
            </button>
          )}
      </div>
        {selectedHour ? (
          <div className="booking-time-picked-row">
            <strong>{selectedHour}</strong>
            <span>Hora escolhida</span>
          </div>
        ) : (
          <div className="booking-time-grid booking-time-grid-hours">
            {HOURS.map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => chooseHour(hour)}
                className="booking-time-cell"
              >
                {hour}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedHour && (
        <div className="booking-time-stage-card booking-time-stage-card-open">
          <div className="booking-time-grid-label">
            <span>Minutos</span>
          </div>
          <div className="booking-time-grid booking-time-grid-minutes">
            {MINUTES.map((minute) => {
              const minuteSlot = `${selectedHour}:${minute}`;
              const isBooked = bookedSlots.includes('all') || bookedSlots.some((slot) => toMinuteSlot(slot) === minuteSlot);
              const isSelected = bookingData.time === minuteSlot;
          return (
            <button
                  key={minute}
              type="button"
              disabled={isBooked}
                  onClick={() => chooseMinute(minute)}
              className={`booking-time-cell ${
                isBooked
                  ? 'booking-time-cell-disabled'
                  : isSelected
                    ? 'booking-time-cell-active'
                    : ''
              }`}
            >
                  {minute}
            </button>
          );
        })}
      </div>
    </div>
      )}
    </div>
  );
}
