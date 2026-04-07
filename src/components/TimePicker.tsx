import React from 'react';
import { Clock, Calendar, Loader2 } from 'lucide-react';

interface BookingData {
  service: string;
  servicePrice: string;
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

export default function TimePicker({ bookingData, setBookingData, bookedSlots, isLoadingSlots }: TimePickerProps) {
  if (!bookingData.date) {
    return (
      <div className="py-6 text-center text-sm font-medium text-luxury-muted/60 bg-luxury-light/30 rounded-xl border border-dashed border-luxury-dark/8">
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

  return (
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
  );
}
