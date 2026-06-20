import { createContext, useContext, useEffect, useState } from 'react';
import { LATEST_VERSION } from '../data/changelog';

const LS_KEY = 'whats_new_seen';

const WhatsNewContext = createContext(null);

export function WhatsNewProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    const lastSeen = localStorage.getItem(LS_KEY) || '';
    if (LATEST_VERSION > lastSeen) {
      setHasUnseen(true);
      setOpen(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(LS_KEY, LATEST_VERSION);
    setHasUnseen(false);
    setOpen(false);
  }

  return (
    <WhatsNewContext.Provider value={{ open, setOpen, dismiss, hasUnseen }}>
      {children}
    </WhatsNewContext.Provider>
  );
}

export const useWhatsNew = () => useContext(WhatsNewContext);
