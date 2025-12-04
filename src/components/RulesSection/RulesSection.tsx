import React, { useState } from 'react';
import { BiChevronDown } from 'react-icons/bi';
import { ResolveNotification } from '@/pages/PredictionMarket/ResolveNotification';
import './RulesSection.scss';

interface Umbrella {
  _id: string;
  displayName: string;
  rule?: string;
  [key: string]: any;
}

interface RulesSectionProps {
  umbrella?: Umbrella | null;
}

export default function RulesSection({ umbrella }: RulesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Get rules from umbrella object, fallback to "Rules Pending" if not found or empty
  const rulesText = umbrella?.rule && umbrella.rule.trim() !== '' 
    ? umbrella.rule 
    : 'Rules Pending';

  const paragraphs = rulesText.split('\n\n');
  const previewParagraphs = paragraphs.slice(0, 3);
  const remainingParagraphs = paragraphs.slice(3);
  
  return (
    <div className="rules-section">
      <h3 className="rules-header">Rules</h3>
      <div className="rules-content">
        <div className="rules-text">
          {/* Show preview paragraphs when collapsed */}
          {!isExpanded && (
            <>
              {previewParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </>
          )}
          
          {/* Show all paragraphs when expanded */}
          {isExpanded && (
            <>
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </>
          )}
          
          {/* Always show expand/collapse button */}
          {!isExpanded ? (
            <button 
              className="expand-button"
              onClick={() => setIsExpanded(true)}
            >
              <BiChevronDown 
                size={14} 
                style={{ 
                  transform: 'rotate(0deg)',
                  transition: 'transform 0.3s ease-in-out'
                }} 
              />
              Show More
            </button>
          ) : (
            <>
              {/* Settlement Notification - shown at bottom when rules are expanded */}
              {umbrella && (
                <div className="settlement-notification-wrapper">
                  <ResolveNotification umbrellaId={umbrella._id} />
                </div>
              )}
              <button 
                className="expand-button"
                onClick={() => setIsExpanded(false)}
              >
                <BiChevronDown 
                  size={14} 
                  style={{ 
                    transform: 'rotate(180deg)',
                    transition: 'transform 0.3s ease-in-out'
                  }} 
                />
                Show Less
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
