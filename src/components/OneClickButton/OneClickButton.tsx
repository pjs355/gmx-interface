import { t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { useCallback, useState } from "react";

import "./OneClickButton.scss";

import language24Icon from "img/ic_language24.svg";

import ModalWithPortal from "../Modal/ModalWithPortal";
import LanguageModalContent from "../NetworkDropdown/LanguageModalContent";

export function OneClickButton({ openSettings }: { openSettings: () => void }) {
  const currentLanguage = useLingui().i18n.locale;
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

  const handleLanguageModalClose = useCallback(() => {
    setIsLanguageModalOpen(false);
  }, []);

  return (
    <>
      <div className="OneClickButton" onClick={() => setIsLanguageModalOpen(true)}>
        <img className="OneClickButton-icon" src={language24Icon} alt="Select Language" />
    </div>

      <ModalWithPortal
        className="language-popup"
        isVisible={isLanguageModalOpen}
        setIsVisible={setIsLanguageModalOpen}
        label={t`Select Language`}
      >
        <LanguageModalContent currentLanguage={currentLanguage} onClose={handleLanguageModalClose} />
      </ModalWithPortal>
    </>
  );
}
