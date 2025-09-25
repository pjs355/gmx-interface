import React, { createContext, useContext, useState, ReactNode } from 'react';

// Simplified curtain context for prediction markets
interface CurtainContextType {
  isCurtainOpen: boolean;
  openCurtain: () => void;
  closeCurtain: () => void;
}

const CurtainContext = createContext<CurtainContextType | null>(null);

export function PredictionCurtainProvider({ children }: { children: ReactNode }) {
  const [isCurtainOpen, setIsCurtainOpen] = useState(false);

  const openCurtain = () => setIsCurtainOpen(true);
  const closeCurtain = () => setIsCurtainOpen(false);

  return (
    <CurtainContext.Provider value={{ isCurtainOpen, openCurtain, closeCurtain }}>
      {children}
    </CurtainContext.Provider>
  );
}

export function useIsCurtainOpen() {
  const context = useContext(CurtainContext);
  return context?.isCurtainOpen ?? false;
}

export function useCurtainActions() {
  const context = useContext(CurtainContext);
  return {
    openCurtain: context?.openCurtain ?? (() => {}),
    closeCurtain: context?.closeCurtain ?? (() => {}),
  };
}

export function PredictionCurtain({ header, children, dataQa }: { header?: ReactNode; children: ReactNode; dataQa?: string }) {
  const { isCurtainOpen } = useContext(CurtainContext) ?? {};

  return (
    <div className="prediction-curtain" data-qa={dataQa}>
      {isCurtainOpen ? (
        <div className="prediction-curtain-content">
          {children}
        </div>
      ) : (
        header || null
      )}
    </div>
  );
}
