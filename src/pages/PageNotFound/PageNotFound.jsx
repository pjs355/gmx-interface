import { t } from "@lingui/macro";
import { Trans } from "@lingui/react";

// Removed lib/legacy imports - not needed for prediction markets

import SEO from "components/Common/SEO";
import Footer from "components/Footer/Footer";
import { useEffect } from "react";

import "./PageNotFound.css";

function PageNotFound() {
  const homeUrl = "/";
  const tradePageUrl = "/predictions";

  // Auto-redirect to homepage immediately
  useEffect(() => {
    window.location.replace(homeUrl);
  }, [homeUrl]);

  return (
    <SEO title={t`Page not found | LevelUp Predictions`}>
      <div className="page-layout">
        <div className="page-not-found-container">
          <div className="page-not-found">
            <h2>
              <Trans>Page not found</Trans>
            </h2>
            <p className="go-back">
              <Trans>
                <span>Return to </span>
                <a href={homeUrl}>Homepage</a> <span>or </span> <a href={tradePageUrl}>Trade</a>
              </Trans>
            </p>
          </div>
        </div>
        <Footer />
      </div>
    </SEO>
  );
}

export default PageNotFound;
