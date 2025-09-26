import { FloatingPortal, autoUpdate, flip, shift, useFloating } from "@floating-ui/react";
import { Menu } from "@headlessui/react";
import { t } from "@lingui/macro";
import cx from "classnames";
import { BiChevronDown } from "react-icons/bi";
import { useState } from "react";

import { NestedOption } from "./types";

type Props<V extends string | number> = {
  option: NestedOption<V>;
  selectedValue: V | undefined;
  commonOptionClassname?: string;
  onOptionClick: ((value: V) => void) | undefined;
  qa?: string;
};

export default function NestedTab<V extends string | number>({
  option,
  selectedValue,
  commonOptionClassname,
  onOptionClick,
  qa,
}: Props<V>) {
  const [isOpen, setIsOpen] = useState(false);
  
  const { refs, floatingStyles } = useFloating({
    middleware: [flip(), shift()],
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
  });

  const selectedSubOption = option.options.find((opt) => opt.value === selectedValue);

  const label = selectedSubOption ? selectedSubOption.label || selectedSubOption.value : t`More`;

  return (
    <Menu as="div" className="Tab-option flex items-center justify-center gap-8">
      <Menu.Button
        as="div"
        className={cx("flex cursor-pointer items-center justify-center text-white", commonOptionClassname)}
        ref={refs.setReference}
        data-qa={qa ? `${qa}-tab-${option.label}` : undefined}
        onClick={() => setIsOpen(!isOpen)}
      >
        {label}

        <BiChevronDown 
          size={16} 
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease-in-out'
          }}
        />
      </Menu.Button>
      <FloatingPortal>
        <Menu.Items
          as="div"
          className="z-[1105] mt-8 rounded-4 border border-gray-800 bg-black outline-none trade-mode-menu"
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            backgroundColor: 'black',
            borderRadius: 8,
            paddingTop: 8,
            paddingBottom: 8,
            minWidth: 160,
            zIndex: 9999,
            position: 'absolute',
          }}
        >
          {option.options.map((subOpt) => {
            return (
              <Menu.Item
                as="div"
                key={subOpt.value}
                className={cx(
                  "text-body-medium cursor-pointer text-white hover:text-white trade-mode-menu-item",
                  { "text-white": subOpt.value === selectedValue }
                )}
                style={{
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  paddingTop: 12,
                  paddingBottom: 12,
                  paddingLeft: 16,
                  paddingRight: 16,
                  minHeight: 44,
                  borderRadius: 6,
                }}
                onClick={() => onOptionClick?.(subOpt.value)}
              >
                {subOpt.label ?? subOpt.value}
              </Menu.Item>
            );
          })}
        </Menu.Items>
      </FloatingPortal>
    </Menu>
  );
}
