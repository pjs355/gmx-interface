import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEffect } from "react";
import { SWRConfig } from "swr";

import "styles/globals.css";
import "./App.scss";

import { LANGUAGE_LOCALSTORAGE_KEY } from "config/localStorage";
import { defaultLocale, dynamicActivate } from "lib/i18n";

import { AppRoutes } from "./AppRoutes";
import { SWRConfigProp } from "./swrConfig";

function App() {
  useEffect(() => {
    const defaultLanguage = localStorage.getItem(LANGUAGE_LOCALSTORAGE_KEY) || defaultLocale;
    dynamicActivate(defaultLanguage);
  }, []);

  return (
    <I18nProvider i18n={i18n as any}>
      <SWRConfig value={SWRConfigProp}>
        <AppRoutes />
      </SWRConfig>
    </I18nProvider>
  );
}

export default App;