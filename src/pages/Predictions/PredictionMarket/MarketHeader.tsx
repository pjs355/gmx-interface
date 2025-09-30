import React, { useMemo } from 'react';
import type { Umbrella } from 'lib/umbrellaDataService';
import gtaVIImage from 'img/ic_gtaVI_40.svg';
import { resolveLogoByTags, collectTagsFromUmbrella } from '../utils/gameLogoResolver';

type MarketHeaderProps = {
  umbrella: Umbrella;
  titleRef: React.RefObject<HTMLHeadingElement>;
};

export const MarketHeader: React.FC<MarketHeaderProps> = ({ umbrella, titleRef }) => {
  const resolvedLogo = useMemo(() => {
    const tags = collectTagsFromUmbrella(umbrella);
    return resolveLogoByTags(tags);
  }, [umbrella]);

  return (
    <div style={{ marginBottom: 8 }}>
      <div className="market-header">
        <div className="market-title-container">
          <img
            src={umbrella.image || resolvedLogo || gtaVIImage}
            alt="Umbrella"
            className="market-image"
          />
          <h1 ref={titleRef} className="mb-16 text-34 font-bold" style={{ color: 'white' }}>
            {umbrella.displayName}
          </h1>
          {umbrella.description && (
            <p style={{ color: '#888', fontSize: '16px', marginTop: '8px' }}>
              {umbrella.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};


