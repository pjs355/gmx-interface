import cx from "classnames";
import React from "react";
import "./ExternalLink.scss";

type Props = {
  href: string;
  children: React.ReactNode;
  className?: string;
  newTab?: boolean;
};

const ExternalLink = React.forwardRef<HTMLAnchorElement, Props>(({ href, children, className, newTab = true }, ref) => {
  const classNames = cx("link-underline", className);
  const props = {
    href,
    className: classNames,
    ref,
    ...(newTab
      ? {
          target: "_blank",
          rel: "noopener noreferrer",
        }
      : {}),
  };
  return <a {...props}>{children}</a>;
});

ExternalLink.displayName = "ExternalLink";

export default ExternalLink;
