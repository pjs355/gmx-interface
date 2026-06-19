import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEffect } from "react";

import { useHideContentPrerender } from "@/content/useHideContentPrerender";

import "styles/globals.css";
// react-toastify@9 does NOT auto-inject styles (v10+ does). Without this import the
// global `<ToastContainer>` in `AppRoutes` loses `position: fixed`, width, z-index,
// and enter/exit animations, so toasts render inline as a huge static block under
// the footer (most visible on the home page after submitting an order). Loaded
// before `App.scss` so our custom theme overrides (`.Toastify__toast--success`,
// `.Toastify__toast--error`, etc.) cascade on top.
import "react-toastify/dist/ReactToastify.css";
import "./App.scss";

import { LANGUAGE_LOCALSTORAGE_KEY } from "config/localStorage";
import { defaultLocale, dynamicActivate } from "@/services/i18n/i18n.ts";

import SEO from "components/Common/SEO";
import { AppRoutes } from "./routes/AppRoutes.tsx";

function App() {
	useHideContentPrerender();

	useEffect(() => {
		const defaultLanguage = localStorage.getItem(LANGUAGE_LOCALSTORAGE_KEY) || defaultLocale;
		dynamicActivate(defaultLanguage);
	}, []);

	return (
		<I18nProvider i18n={i18n as any}>
			<SEO>
				<AppRoutes />
			</SEO>
		</I18nProvider>
	);
}

export default App;
