import cx from "classnames";
import React, { PropsWithChildren, useCallback, useEffect, useRef, useState } from "react";
import { MdClose } from "react-icons/md";
import { useMedia } from "react-use";

import Portal from "components/Common/Portal";

import Modal from "./Modal";
import "./SlideModal.scss";

/**
 * Mobile bottom sheet. Slides up from the bottom edge; dismisses by drag,
 * backdrop tap, or the close button.
 *
 * All positioning + reveal live in SlideModal.scss (a CSS `transform`
 * transition toggled by `.is-open`) — NOT utility classes or the Web
 * Animations API. This project has no Tailwind, so the previous version's
 * `fixed bottom-0 translate-y-full …` classes generated nothing and the sheet
 * rendered off-screen with no transform. Plain CSS is framework-independent.
 */
function MobileSlideModal({
	children,
	label,
	headerContent,
	headerRef,
	qa,
	isVisible: isOpen,
	setIsVisible: setIsOpen,
	contentPadding = true,
	footerContent,
	className,
	noDivider = false,
}: PropsWithChildren<{
	label?: React.ReactNode;
	headerContent?: React.ReactNode;
	headerRef?: React.Ref<HTMLDivElement>;
	isVisible: boolean;
	setIsVisible: (isVisible: boolean) => void;
	qa?: string;
	contentPadding?: boolean;
	footerContent?: React.ReactNode;
	className?: string;
	noDivider?: boolean;
}>) {
	const sheetRef = useRef<HTMLDivElement | null>(null);
	const dragHandleRef = useRef<HTMLDivElement | null>(null);

	// Keep the sheet mounted through its slide-out so the close animates, then
	// unmount. `entered` toggles the `.is-open` class (translateY(100%) → 0).
	const [mounted, setMounted] = useState(isOpen);
	const [entered, setEntered] = useState(false);
	// The backdrop dismisses on tap-outside, but must NOT react to the tail of
	// the very gesture that opened the sheet (a touch fires a ghost click /
	// pointer settle ~300ms after tap), which was closing it instantly.
	const [backdropArmed, setBackdropArmed] = useState(false);

	// Mount on open; on close, run the slide-down first, then unmount.
	useEffect(() => {
		if (isOpen) {
			setMounted(true);
			return;
		}
		if (!mounted) return;
		setEntered(false);
		const t = window.setTimeout(() => setMounted(false), 280);
		return () => window.clearTimeout(t);
	}, [isOpen, mounted]);

	// Once mounted, flip to entered on the next painted frame so the transform
	// transitions up from below the fold instead of appearing in place. Two
	// rAFs guarantee a frame at translateY(100%) lands before the flip.
	useEffect(() => {
		if (!mounted || !isOpen) return;
		let inner = 0;
		const outer = requestAnimationFrame(() => {
			inner = requestAnimationFrame(() => setEntered(true));
		});
		return () => {
			cancelAnimationFrame(outer);
			cancelAnimationFrame(inner);
		};
	}, [mounted, isOpen]);

	useEffect(() => {
		if (!entered) {
			setBackdropArmed(false);
			return;
		}
		const t = window.setTimeout(() => setBackdropArmed(true), 350);
		return () => window.clearTimeout(t);
	}, [entered]);

	// Freeze the page behind the sheet with a body class (same mechanism as the
	// trade curtain) instead of RemoveScroll, whose wrapper interfered with the
	// fixed sheet. Save + restore scrollY so the page doesn't jump on close.
	useEffect(() => {
		if (!isOpen) return;
		const scrollY = window.scrollY;
		document.documentElement.classList.add("slide-modal-locked");
		document.body.classList.add("slide-modal-locked");
		document.body.style.top = `-${scrollY}px`;
		return () => {
			document.documentElement.classList.remove("slide-modal-locked");
			document.body.classList.remove("slide-modal-locked");
			document.body.style.top = "";
			window.scrollTo(0, scrollY);
		};
	}, [isOpen]);

	const close = useCallback(() => setIsOpen(false), [setIsOpen]);

	// Drag-to-dismiss from the grab handle / title bar. Native listeners so
	// touchmove can preventDefault; the content below scrolls independently.
	useEffect(() => {
		const handle = dragHandleRef.current;
		const el = sheetRef.current;
		if (!handle || !el || !entered) return;

		let startY = 0;
		let currentY = 0;
		let dragging = false;

		const onStart = (e: TouchEvent) => {
			startY = e.touches[0].clientY;
			currentY = startY;
			dragging = true;
			el.style.transition = "none";
		};
		const onMove = (e: TouchEvent) => {
			if (!dragging) return;
			currentY = e.touches[0].clientY;
			const dy = currentY - startY;
			// Track downward drags only (the dismiss direction).
			if (dy > 0) {
				e.preventDefault();
				el.style.transform = `translateY(${dy}px)`;
			}
		};
		const onEnd = () => {
			if (!dragging) return;
			dragging = false;
			const dy = currentY - startY;
			if (dy > 90) {
				// Past the dismiss threshold: glide off-screen, then close. The
				// unmount clears the leftover inline transform.
				el.style.transition = "transform 220ms cubic-bezier(0.4, 0, 1, 1)";
				el.style.transform = "translateY(100%)";
				const done = () => {
					el.removeEventListener("transitionend", done);
					close();
				};
				el.addEventListener("transitionend", done);
			} else {
				// Snap back to rest; clearing the inline styles hands control back
				// to the `.is-open` class transform + transition.
				el.style.transition = "";
				el.style.transform = "";
			}
		};

		handle.addEventListener("touchstart", onStart, { passive: false });
		handle.addEventListener("touchmove", onMove, { passive: false });
		handle.addEventListener("touchend", onEnd);
		handle.addEventListener("touchcancel", onEnd);
		return () => {
			handle.removeEventListener("touchstart", onStart);
			handle.removeEventListener("touchmove", onMove);
			handle.removeEventListener("touchend", onEnd);
			handle.removeEventListener("touchcancel", onEnd);
		};
	}, [entered, close]);

	if (!mounted) return null;

	return (
		<Portal>
			<div
				className={cx("slide-modal-backdrop", {
					"is-open": entered,
					"is-armed": entered && backdropArmed,
				})}
				onClick={close}
				aria-hidden="true"
			/>
			<div className="slide-modal-anchor">
				<div
					data-qa={qa}
					ref={sheetRef}
					className={cx("slide-modal-panel", { "is-open": entered }, className)}
				>
					<div ref={dragHandleRef} className="slide-modal-handle">
						<div className="slide-modal-grabber" aria-hidden="true" />
						<div className="slide-modal-header">
							<div className="slide-modal-title">{label}</div>
							<MdClose
								fontSize={20}
								className="slide-modal-close"
								onClick={close}
								aria-label="Close"
							/>
						</div>
						{headerRef ? (
							<div ref={headerRef} />
						) : headerContent ? (
							<div>{headerContent}</div>
						) : null}
						{!noDivider && <div className="slide-modal-divider" />}
					</div>

					<div className="slide-modal-scroll">
						<div className={cx("slide-modal-content", { "is-flush": !contentPadding })}>
							{children}
						</div>
					</div>
					{footerContent && (
						<>
							<div className="slide-modal-divider" />
							<div>{footerContent}</div>
						</>
					)}
				</div>
			</div>
		</Portal>
	);
}

export function SlideModal({
	children,
	label,
	headerContent,
	headerRef,
	isVisible,
	setIsVisible,
	qa,
	contentPadding = true,
	footerContent,
	className,
	noDivider = false,
	desktopContentClassName,
}: PropsWithChildren<{
	label?: React.ReactNode;
	headerContent?: React.ReactNode;
	headerRef?: React.Ref<HTMLDivElement>;
	isVisible: boolean;
	setIsVisible: (isVisible: boolean) => void;
	qa?: string;
	contentPadding?: boolean;
	footerContent?: React.ReactNode;
	className?: string;
	noDivider?: boolean;
	desktopContentClassName?: string;
}>) {
	const isMobile = useMedia("(max-width: 700px)", false);

	if (isMobile) {
		return (
			<MobileSlideModal
				label={label}
				headerContent={headerContent}
				headerRef={headerRef}
				qa={qa}
				isVisible={isVisible}
				setIsVisible={setIsVisible}
				contentPadding={contentPadding}
				footerContent={footerContent}
				noDivider={noDivider}
				className={className}
			>
				{children}
			</MobileSlideModal>
		);
	}

	return (
		<Portal>
			<Modal
				qa={qa}
				setIsVisible={setIsVisible}
				isVisible={isVisible}
				label={label}
				headerContent={headerContent}
				contentPadding={contentPadding}
				noDivider={noDivider}
				footerContent={footerContent}
				className={className}
				contentClassName={desktopContentClassName}
			>
				{children}
			</Modal>
		</Portal>
	);
}
