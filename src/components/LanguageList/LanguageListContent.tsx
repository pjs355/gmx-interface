import cx from "classnames";

import { dynamicActivate, isTestLanguage, locales } from "@/services/i18n/i18n";

const flagDe = new URL("../../assets/img/flag_de.svg", import.meta.url).href;
const flagEn = new URL("../../assets/img/flag_en.svg", import.meta.url).href;
const flagEs = new URL("../../assets/img/flag_es.svg", import.meta.url).href;
const flagFr = new URL("../../assets/img/flag_fr.svg", import.meta.url).href;
const flagJa = new URL("../../assets/img/flag_ja.svg", import.meta.url).href;
const flagKo = new URL("../../assets/img/flag_ko.svg", import.meta.url).href;
const flagRu = new URL("../../assets/img/flag_ru.svg", import.meta.url).href;
const flagZh = new URL("../../assets/img/flag_zh.svg", import.meta.url).href;
const checkedIcon = new URL("../../assets/img/ic_checked.svg", import.meta.url).href;

type Props = {
	currentLanguage: string | undefined;
	onClose?: () => void;
	onSelect?: (languageCode: string) => void;
};

const flagIconMap = new Map<string, string>([
	["de", flagDe],
	["en", flagEn],
	["es", flagEs],
	["fr", flagFr],
	["ja", flagJa],
	["ko", flagKo],
	["ru", flagRu],
	["zh", flagZh],
]);

const localeLabelMap = locales as Record<string, string>;

function getLocaleLabel(languageCode: string): string {
	const value = localeLabelMap[languageCode];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Missing locale label for ${languageCode}`);
	}
	return value;
}

function getFlag(languageCode: string): string {
	const flag = flagIconMap.get(languageCode);
	if (flag === undefined) {
		throw new Error(`Missing flag asset for ${languageCode}`);
	}
	return flag;
}

export default function LanguageListContent({ currentLanguage, onClose, onSelect }: Props) {
	const languageCodes = Object.keys(locales);

	return (
		<>
			{languageCodes.map((code) => {
				const isActive = currentLanguage === code;
				const label = getLocaleLabel(code);

				return (
					<div
						key={code}
						className={cx("network-dropdown-menu-item", "menu-item", "language-modal-item", {
							active: isActive,
						})}
						onClick={() => {
							dynamicActivate(code)
								.then(() => {
									if (onSelect) {
										onSelect(code);
									}
								})
								.catch((error) => {
									console.error("error", error);
								})
								.finally(() => {
									if (onClose) {
										onClose();
									}
								});
						}}
					>
						<div className="menu-item-group">
							<div className="menu-item-icon">
								{isTestLanguage(code) ? (
									<span role="img" aria-label="Test language">
										🫐
									</span>
								) : (
									<img className="network-dropdown-icon" src={getFlag(code)} alt={label} />
								)}
							</div>
							<span className="language-item">{label}</span>
						</div>
						<div className="network-dropdown-menu-item-img">
							{isActive && <img src={checkedIcon} alt={label} />}
						</div>
					</div>
				);
			})}
		</>
	);
}
