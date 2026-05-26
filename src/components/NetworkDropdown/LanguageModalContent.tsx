import cx from "classnames";

import { dynamicActivate, isTestLanguage, locales } from "@/services/i18n/i18n";
// Removed lib/legacy import - not needed for prediction markets

import checkedIcon from "@/assets/img/ic_checked.svg";

type Props = {
	currentLanguage: string | undefined;
	onClose: () => void;
};

export default function LanguageModalContent({ currentLanguage, onClose }: Props) {
	return (
		<>
			{Object.keys(locales).map((item) => {
				return (
					<div
						key={item}
						className={cx("network-dropdown-menu-item  menu-item language-modal-item", {
							active: currentLanguage === item,
						})}
						onClick={() => {
							dynamicActivate(item).then(onClose);
						}}
					>
						<div className="menu-item-group">
							<div className="menu-item-icon">
								{isTestLanguage(item) ? (
									"🫐"
								) : (
									<img
										className="network-dropdown-icon"
										src={`/img/flag_${item}.svg`}
										alt={(locales as any)[item]}
									/>
								)}
							</div>
							<span className="language-item">{(locales as any)[item]}</span>
						</div>
						<div className="network-dropdown-menu-item-img">
							{currentLanguage === item && <img src={checkedIcon} alt={(locales as any)[item]} />}
						</div>
					</div>
				);
			})}
		</>
	);
}
