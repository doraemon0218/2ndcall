'use client';

import { useEffect, useState } from 'react';
import { AppEvent, getEvents } from '@/lib/eventLog';

// イベントログを読み込み、追記されるたびに更新する
export function useEventLog(): AppEvent[] {
  const [events, setEvents] = useState<AppEvent[]>([]);
  useEffect(() => {
    const refresh = () => setEvents(getEvents());
    refresh();
    window.addEventListener('or-event-logged', refresh);
    return () => window.removeEventListener('or-event-logged', refresh);
  }, []);
  return events;
}
