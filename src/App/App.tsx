import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEffect } from "react";

import "styles/globals.css";
import "./App.scss";

import { LANGUAGE_LOCALSTORAGE_KEY } from "config/localStorage";
import { defaultLocale, dynamicActivate } from "@/services/i18n/i18n.ts";

import { AppRoutes } from "./routes/AppRoutes.tsx";

function App() {
	useEffect(() => {
		const defaultLanguage =
			localStorage.getItem(LANGUAGE_LOCALSTORAGE_KEY) || defaultLocale;
		dynamicActivate(defaultLanguage);
	}, []);

	return (
		<I18nProvider i18n={i18n as any}>
			<AppRoutes />
		</I18nProvider>
	);
}

export default App;
