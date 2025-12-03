# LevelUp Email Templates

This folder contains HTML email templates designed to match the LevelUp app styling. All templates are compatible with Gmail, Outlook, Apple Mail, and mobile email clients.

## Templates

### 1. `market-resolved.html`
**Purpose:** Notify users that a market they participated in has resolved and they can claim their winnings.

**When to send:** Automatically after a market resolves and the user has a winning position.

**Template Variables:**
Replace these placeholders with actual data:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{MARKET_NAME}}` | The market/event name | "Team Liquid vs. Cloud9 - IEM Katowice 2025" |
| `{{USER_PICK}}` | The user's winning prediction | "Team Liquid" |
| `{{WINNINGS_AMOUNT}}` | Total payout amount | "$247.50" |
| `{{SHARES}}` | Number of shares held | "247.5" |
| `{{AVG_PRICE}}` | Average purchase price | "62¢" |
| `{{PROFIT}}` | Net profit from the prediction | "+$94.05" |

---

### 2. `fund-account.html`
**Purpose:** Remind users who created an account but haven't funded it yet to add funds and start trading.

**When to send:** 1-3 days after account creation if the user has not added any funds.

**Template Variables:**
This template doesn't require dynamic variables - it's a general reminder email.

**Content includes:**
- Account Setup header
- "Ready to Start Trading?" headline
- 3-step "How It Works" guide
- "Fund Your Account" CTA button linking to `/payments`
- "Need Help" section pointing to Discord

---

### 3. `trade-confirmation.html`
**Purpose:** Send users an order receipt after they complete a trade, confirming their position.

**When to send:** Immediately after a trade is successfully executed.

**Template Variables:**
Replace these placeholders with actual data:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{MARKET_NAME}}` | The market/event name | "Team Liquid vs. Cloud9 - IEM Katowice 2025" |
| `{{SIDE}}` | The position bought (Yes/No or team name) | "Bought: Team Liquid" |
| `{{SHARES}}` | Number of shares purchased | "125" |
| `{{PRICE_PER_SHARE}}` | Price paid per share | "62c" |
| `{{TOTAL_COST}}` | Total amount spent | "$77.50" |
| `{{POTENTIAL_PAYOUT}}` | Payout if prediction is correct ($1/share) | "$125.00" |
| `{{ORDER_DATE}}` | Timestamp of the order | "December 2, 2025 at 3:45 PM EST" |

**Content includes:**
- Trade Confirmed header with market name
- Position badge showing what was bought
- Order details table (shares, price, cost, potential payout)
- Order timestamp
- "View Your Position" CTA button linking to `/positions`
- "What Happens Next" explainer section

## Design Specifications

### Colors
- **Background:** `#000000` (black)
- **Card Background:** `#1a1a1a`
- **Secondary Background:** `#0f0f0f`
- **Border Color:** `#2a2a2a`
- **Primary Purple:** `#7c3aed`
- **Purple Hover:** `#8b5cf6`
- **Success Green:** `#16a34a`
- **Text Primary:** `#ffffff`
- **Text Secondary:** `rgba(255, 255, 255, 0.7)`
- **Text Muted:** `rgba(255, 255, 255, 0.5)`

### Typography
- **Font Family:** Inter (with system fallbacks)
- **Hero Text:** 36px, weight 800
- **Body Text:** 14-18px, weight 400-500
- **Uppercase Labels:** 11px, weight 600, letter-spacing 1px

### Button Style
- **Background:** `#7c3aed`
- **Border Radius:** 10px
- **Padding:** 18px 40px
- **Box Shadow:** `0 4px 14px rgba(124, 58, 237, 0.4)`

## Testing

### Email Testing Services
- [Litmus](https://litmus.com) - Comprehensive email testing
- [Email on Acid](https://emailonacid.com) - Cross-client testing
- [Mail Tester](https://mailtester.com) - Deliverability testing

### Manual Testing Checklist
- [ ] Gmail (Web)
- [ ] Gmail (Mobile App - iOS & Android)
- [ ] Outlook (Web)
- [ ] Outlook (Desktop - Windows)
- [ ] Outlook (Mobile App)
- [ ] Apple Mail (macOS)
- [ ] Apple Mail (iOS)
- [ ] Yahoo Mail (Web)
- [ ] Dark mode appearance

## Responsive Breakpoints

- **Desktop:** > 600px (max-width: 600px container)
- **Mobile:** ≤ 600px (full-width, adjusted padding and font sizes)

## Implementation Notes

1. **Inline CSS:** All critical styles are inlined for maximum compatibility
2. **MSO Conditionals:** Outlook-specific VML is included for proper button rendering
3. **Preview Text:** Hidden preheader text is included for inbox preview
4. **Dark Mode:** `prefers-color-scheme: dark` media query support included
5. **Image Fallbacks:** No external images required - uses emoji and text

## Future Templates

Planned templates for this folder:
- `market-resolved-loss.html` - When user's prediction was incorrect
- `welcome.html` - New user welcome email
- `weekly-digest.html` - Weekly summary of market activity
- `new-markets.html` - Notify about new prediction markets
- `account-verification.html` - Email verification
- `inactive-reminder.html` - Re-engage users who haven't traded recently

