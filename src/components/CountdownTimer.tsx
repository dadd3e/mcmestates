import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface CountdownTimerProps {
  id?: string;
  targetDate: string; // "YYYY-MM-DD" or ISO string
  targetTime?: string; // "HH:MM" e.g. "18:00"
}

export default function CountdownTimer({ id, targetDate, targetTime = "18:00" }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    expired: false
  });

  useEffect(() => {
    const calculateTime = () => {
      // Parse target datetime
      const targetDateTimeStr = `${targetDate}T${targetTime}:00`;
      const targetTimeMs = new Date(targetDateTimeStr).getTime();
      const nowMs = new Date().getTime();
      const difference = targetTimeMs - nowMs;

      if (difference <= 0) {
        setTimeLeft(prev => ({ ...prev, expired: true }));
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        expired: false
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [targetDate, targetTime]);

  if (timeLeft.expired) {
    return (
      <span id={id} className="inline-flex items-center px-2 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        <Timer className="h-3 w-3 mr-1" />
        Bidding Closed
      </span>
    );
  }

  return (
    <div id={id} className="inline-flex items-center text-xs font-mono bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1">
      <Timer className="h-3.5 w-3.5 mr-1 text-amber-600 animate-pulse" />
      <span className="font-semibold mr-1">Ends in:</span>
      <span>
        {timeLeft.days > 0 ? `${timeLeft.days}d ` : ''}
        {timeLeft.hours.toString().padStart(2, '0')}h{' '}
        {timeLeft.minutes.toString().padStart(2, '0')}m{' '}
        {timeLeft.seconds.toString().padStart(2, '0')}s
      </span>
    </div>
  );
}
