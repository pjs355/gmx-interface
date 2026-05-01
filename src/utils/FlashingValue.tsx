import { useFlashOnChange } from "./useFlashOnChange";

/**
 * Span that briefly flashes when its formatted text changes.
 *
 * Keyed on the rendered string so identical-display values (e.g. `$5.00` -> `$5.00` after
 * sub-cent jitter) never blink. First mount never flashes (handled inside `useFlashOnChange`).
 *
 * Pass `flashClassName` to control which CSS class triggers the animation — the SCSS for that
 * class is responsible for the keyframes / duration.
 */
export function FlashingValue({
	value,
	className,
	flashClassName,
}: {
	value: string;
	/** Base class always on the span. */
	className?: string;
	/** Class added during the flash window. */
	flashClassName?: string;
}) {
	const flash = useFlashOnChange(value, { className: flashClassName });
	const cls = [className, flash].filter(Boolean).join(" ");
	return <span className={cls}>{value}</span>;
}
