import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

interface BookingData {
  service: string;
  servicePrice: string;
  selectedServices: { category: string; name: string; price: string }[];
  date: string;
  time: string;
  name: string;
  phone: string;
}

interface BookingCalendarProps {
  currentMonthDate: Date;
  setCurrentMonthDate: React.Dispatch<React.SetStateAction<Date>>;
  bookingData: BookingData;
  setBookingData: React.Dispatch<React.SetStateAction<BookingData>>;
  compact?: boolean;
  availabilityByDate?: Record<string, boolean>;
  isLoadingAvailability?: boolean;
  onDateSelected?: () => void;
  onEditDate?: () => void;
}

export default function BookingCalendar({
  currentMonthDate,
  setCurrentMonthDate,
  bookingData,
  setBookingData,
  compact = false,
  availabilityByDate = {},
  isLoadingAvailability = false,
  onDateSelected,
  onEditDate,
}: BookingCalendarProps) {
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
  const selectedDateLabel = bookingData.date ? bookingData.date.split('-').reverse().join('/') : '';

  if (compact && bookingData.date) {
    return (
      <div className="booking-calendar-panel booking-calendar-panel-compact bg-luxury-light/80 border border-luxury-dark/8 p-3 sm:p-5">
        <div className="booking-compact-card">
          <div className="booking-compact-icon">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <span>Data escolhida</span>
            <strong>{selectedDateLabel}</strong>
          </div>
          <button type="button" onClick={onEditDate}>
            Alterar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-calendar-panel bg-luxury-light/80 border border-luxury-dark/8 p-3 sm:p-5">
      <div className="flex justify-between items-center mb-3 sm:mb-5">
        <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-luxury-gold/30 hover:bg-luxury-gold/10 text-luxury-gold transition-all duration-300 cursor-pointer hover:border-luxury-gold">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-serif text-lg sm:text-xl font-medium text-luxury-dark tracking-wide">
          {monthNames[month]} <span className="text-luxury-gold">{year}</span>
        </span>
        <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-luxury-gold/30 hover:bg-luxury-gold/10 text-luxury-gold transition-all duration-300 cursor-pointer hover:border-luxury-gold">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2 sm:mb-3">
        {weekDays.map(day => (
          <div key={day} className="text-center text-[9px] tracking-[0.2em] uppercase text-luxury-muted/60 font-semibold py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-x-1 gap-y-1">
        {blanks.map(blank => (
          <div key={`blank-${blank}`} className="p-2"></div>
        ))}
        {days.map(day => {
          const dateObj = new Date(year, month, day);
          const isPast = dateObj < today;
          const isToday = dateObj.getTime() === today.getTime();
          const isSunday = dateObj.getDay() === 0;

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = bookingData.date === dateStr;
          const isUnavailableByAgenda = availabilityByDate[dateStr] === false;
          const isPendingAvailability =
            isLoadingAvailability && !Object.prototype.hasOwnProperty.call(availabilityByDate, dateStr) && !isPast && !isSunday;
          const isUnavailable = isPast || isSunday || isUnavailableByAgenda;

          return (
            <button
              key={day}
              type="button"
              disabled={isUnavailable}
              onClick={() => {
                setBookingData((current) => ({ ...current, date: dateStr, time: '' }));
                onDateSelected?.();
              }}
              className={`p-0.5 sm:p-1.5 rounded-full text-sm flex flex-col items-center justify-center transition-all duration-300 ${
                isSelected
                  ? 'bg-luxury-gold text-white shadow-md shadow-luxury-gold/30 scale-105'
                  : isUnavailable
                    ? 'text-luxury-muted/20 cursor-not-allowed'
                    : isToday
                      ? 'booking-calendar-day-available text-luxury-gold font-bold hover:bg-luxury-gold/15 cursor-pointer'
                      : 'booking-calendar-day-available text-luxury-dark hover:bg-luxury-gold/10 cursor-pointer'
              }`}
            >
              <div className="w-7 h-7 flex items-center justify-center">
                {day}
              </div>
              {isToday && !isSelected && <div className="w-1 h-1 rounded-full bg-luxury-gold mt-[-2px]"></div>}
              {!isUnavailable && availabilityByDate[dateStr] === true && !isSelected && !isToday && (
                <div className="booking-calendar-availability-dot"></div>
              )}
              {isPendingAvailability && !isSelected && <div className="w-1 h-1 rounded-full bg-luxury-muted/30 mt-[-2px]"></div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
