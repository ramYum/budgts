# Budgts UI Redesign Specification

## Purpose

Redesign the Budgts UI around one central product idea:

> **Calm, visual, friendly financial control — not a spreadsheet.**

Budgts should make it immediately obvious:

1. How am I doing financially?
2. How much came in?
3. How much did I spend?
4. How much money did I keep?
5. Where did my money go?
6. What can I change to save more?

The redesign is primarily a **presentation-layer redesign**. Preserve the existing financial engine, data model, Plaid ingestion, categorization, event-role logic, budget effects, Money Left, Savings Rate, and other established financial semantics unless a separate engineering task explicitly requires a change.

---

# Supplied Brand Assets and Brand Guidelines — SOURCE OF TRUTH

This redesign specification is now governed by the supplied Budgts brand materials:

- **`New Branding guidelines.png`** — primary visual/brand reference.
- **`New Assets.svg`** — supplied production asset sheet/artwork to reuse where appropriate.

Claude should inspect both supplied files before implementing the UI.

## Brand positioning

The supplied guideline defines Budgts as:

> **Simple money. Brighter tomorrows.**

The brand personality is:

- **Simple**
- **Friendly**
- **Empowering**
- **For a brighter you**

The overall voice is encouraging, human, conversational, and focused on progress rather than perfection.

The guideline explicitly favors:

- Simple, clear language
- Positive and encouraging language
- Conversational language
- Clean and spacious design
- Friendly, simple language
- Inclusive and accessible design
- A sense that money is less overwhelming

Avoid:

- Harsh or overly formal language
- Traditional-bank visual styling
- Excessive color
- Realistic/complex illustrations
- Intimidating or stressful presentation
- Financial jargon without context

## Exact brand palette

Use the supplied guideline palette as the design-system source of truth.

| Name | Hex | Semantic use |
|---|---|---|
| Primary | `#F ECE01` | Optimism / primary brand emphasis |
| Warm Yellow | `#FDAC01` | Energy / secondary emphasis |
| Orange | `#FB5607` | Action |
| Deep Orange | `#F62A01` | Strong emphasis |
| Blue | `#0565EB` | Primary action |
| Cyan | `#08A1F0` | Clarity |
| Green | `#087736` | Growth |
| Emerald | `#00A453` | Wellness / positive states |
| Purple | `#443288` | Focus / sleep |
| Pink | `#FD598A` | Emotion |
| Navy | `#1D1159` | Depth / primary text |
| Warm White | `#F8F3F0` | Main background |

**Correction/implementation note:** The first palette value in the supplied image is visually shown as `#FECE01`; use `#FECE01` rather than the visually ambiguous spacing above.

Therefore the canonical primary palette is:

```text
Primary       #FECE01
Warm Yellow   #FDAC01
Orange        #FB5607
Deep Orange   #F62A01
Blue          #0565EB
Cyan          #08A1F0
Green         #087736
Emerald       #00A453
Purple        #443288
Pink          #FD598A
Navy          #1D1159
Warm White    #F8F3F0
```

### Color hierarchy

Do not use all colors equally.

Recommended hierarchy:

- **Navy** for primary text, headings, and depth.
- **Warm White** for the application background.
- **Blue** for primary interactive actions.
- **Primary yellow** for optimism, highlights, and selected brand emphasis.
- **Orange / Deep Orange** for action/emphasis where stronger attention is needed.
- **Emerald / Green** for positive financial progress.
- **Cyan** for informational/clarity states.
- **Purple** for focus/secondary contexts.
- **Pink** for emotion/soft expressive accents.

Use color semantically and consistently. Avoid turning every category into a saturated rainbow.

## Typography

The supplied guideline specifies:

**Nunito Sans**

Use Nunito Sans as the primary product typeface wherever practical.

Recommended hierarchy from the guideline:

| Element | Weight | Size |
|---|---|---:|
| H1 | Bold | 32px |
| H2 | Bold | 24px |
| H3 | Bold | 20px |
| Body | Regular | 16px |
| Small | Regular | 14px |
| Caption | Regular | 12px |

Financial numbers may use larger display sizing when needed, while preserving the Nunito Sans family and overall hierarchy.

The goal is friendly, modern readability rather than dense financial-dashboard typography.

## Logo

Use the supplied Budgts logo/assets rather than recreating the logo with ordinary text.

The brand lockup includes:

**Budgt**

and:

**SIMPLE MONEY.  
BRIGHTER TOMORROWS.**

Do not distort, recolor arbitrarily, or redraw the supplied logo.

## Cat / illustration system

The cat is a core brand element.

Use the supplied cat illustrations/assets from `New Assets.svg` and the brand guideline.

The guideline's illustration style is:

- Playful
- Minimal
- Expressive
- Friendly
- Simple shapes
- High recognizability
- Emotion conveyed through expression and small decorative marks

Available/illustrated states include concepts such as:

- Neutral
- Happy
- Curious
- Sleepy
- Encouraging/celebratory states

Use the cat as a personality layer, not as decoration on every component.

## App icon system

The supplied guideline shows rounded app icons with simple, bold symbols.

Use that style for:

- Expenses
- Eating Out
- Transport
- Shopping
- Subscriptions
- Other category icons as appropriate

Icon characteristics:

- Simple
- Rounded
- Bold enough to read at small sizes
- Minimal internal detail
- Consistent stroke/weight
- Soft colored containers where appropriate

Do not introduce an unrelated icon family.

## Navigation icon system

The supplied guideline demonstrates:

- Home
- Insights
- Add
- Goals
- Settings

These examples establish the **icon visual language**, not a requirement to replace Budgts' product navigation hierarchy.

For the Budgts product navigation specified below, continue to use the product's functional destinations:

- Home
- Budgets
- Activity
- More

Use the supplied icon style consistently.

If an existing navigation destination uses an icon not shown in the guideline, create/select an icon that visually matches the same simple, rounded, minimal language.

## Buttons and UI components

The supplied guideline shows:

### Primary button

- Blue background (`#0565EB`)
- White text
- Rounded/pill shape
- Strong but friendly contrast
- Optional right-arrow affordance for forward actions

Example:

> Get started →

### Secondary button

- White/warm-white surface
- Navy text
- Thin navy/neutral border
- Rounded/pill shape

### Search

Use a soft, rounded search field with a simple magnifying-glass icon.

### Cards

Use:

- Rounded corners
- Generous internal spacing
- Warm-white/light surfaces
- Subtle elevation or borders
- Strong typography hierarchy
- Occasional brand-color decorative shapes

Avoid excessive shadows.

## Decorative brand elements

The guideline includes:

- Large rounded organic blobs
- Yellow/orange shapes
- Blue shapes
- Emerald/green shapes
- Small sparkle/star accents
- Cat illustrations
- Speech bubbles
- Simple progress-oriented illustrations

Use these selectively on:

- Onboarding
- Empty states
- Goals
- Major success states
- Important promotional/educational cards

Do not put decorative blobs behind dense financial data where they reduce readability.

# 1. Design North Star

## Visual personality

Budgts should feel:

- Calm
- Friendly
- Trustworthy
- Modern
- Premium
- Approachable
- Visually attractive without feeling childish
- Information-rich without feeling like accounting software

Use the supplied Budgts reference image as the visual inspiration.

Do **not** copy the reference literally. Adapt its visual language to Budgts' actual product philosophy.

### Reference visual language to retain

- Warm cream/off-white background
- Near-black/ink typography
- Coral primary action color
- Sun-yellow accent
- Lavender secondary accent
- Sage positive-state color
- Sky informational accent
- Large rounded cards
- Soft borders/shadows
- Generous whitespace
- Friendly cat mascot
- Simple illustrations
- Clean mobile-first navigation

### Target feeling

Think:

> Apple Health × modern banking app × the personality of the Budgts cat.

Avoid making the product look like:

> A children's budgeting app or a spreadsheet.

---

# 2. Brand Color System

The exact palette in the supplied brand guideline is the source of truth.

Use these canonical tokens:

```text
--brand-primary: #FECE01
--brand-warm-yellow: #FDAC01
--brand-orange: #FB5607
--brand-deep-orange: #F62A01
--brand-blue: #0565EB
--brand-cyan: #08A1F0
--brand-green: #087736
--brand-emerald: #00A453
--brand-purple: #443288
--brand-pink: #FD598A
--brand-navy: #1D1159
--brand-warm-white: #F8F3F0
```

Do not use the older cream/coral/sage/sky palette from the original draft. The supplied branding guideline supersedes it.

Financial states should remain easy to understand through semantic use of the brand colors, not through arbitrary category coloring.

# 3. Typography

Use **Nunito Sans** as the primary product typeface, matching the supplied brand guideline.

Base hierarchy:

- H1: Bold, 32px
- H2: Bold, 24px
- H3: Bold, 20px
- Body: Regular, 16px
- Small: Regular, 14px
- Caption: Regular, 12px

Financial numbers should have strong visual hierarchy and may use larger display sizing where appropriate.

Use Navy (`#1D1159`) as the dominant text color.

Do not substitute a generic typeface if Nunito Sans can be loaded/used cleanly in the existing application.

# 4. Global Navigation

## Mobile

Use four primary destinations:

```text
Home
Budgets
Activity
More
```

Bottom navigation remains persistent.

### Home

The user's financial overview.

### Budgets

Spending categories, limits, and budget management.

### Activity

Transaction history and transaction review.

### More

Secondary areas such as:

- Savings Goals
- Accounts
- Insights
- Connected Banks
- Settings
- Help/About

The visible tab can be called **Activity**, while the destination heading can say **Transactions**.

## Desktop

Use a persistent left sidebar.

Suggested structure:

```text
BUDGTS

Home
Budgets
Activity

----------------

Goals
Accounts
Insights

----------------

Settings
```

The sidebar should remain visually quiet and never compete with the financial content.

---

# 5. Global Interaction Rules

## Navigation principle

Every interactive control must have a clear destination or action.

Do not create decorative buttons that appear interactive but do nothing.

## Back behavior

Secondary/detail screens should provide a clear back affordance on mobile.

On desktop, the persistent sidebar remains available.

## Loading states

Use skeletons or calm placeholder states rather than spinners everywhere.

## Empty states

Empty states should explain:

1. What is missing
2. Why it matters
3. What the user can do next

Use the cat mascot sparingly for friendly empty states.

## Error states

Errors should explain the problem in plain language and provide the next useful action.

---

# 6. GET STARTED / ONBOARDING

## Screen 1 — Welcome

### Layout

Large Budgts cat illustration.

Headline:

> **Your money, made clearer.**

Supporting text:

> Budgts automatically organizes your money so you can see what you're spending, what you're keeping, and where you can save more.

### Buttons

**Get started**

→ Begins onboarding and takes the user to the bank connection step.

**Already have an account? Sign in**

→ Takes the user to the existing authentication/sign-in screen.

---

## Screen 2 — Connect Your Bank

Headline:

> **Let's bring your money together.**

Supporting text:

> Connect your bank accounts and Budgts will automatically organize your transactions.

### Primary button

**Connect a bank**

→ Opens the existing Plaid Link flow.

### Security reassurance

> Your bank credentials never reach Budgts.

After successful connection:

→ Continue to account import/mapping as dictated by the existing Plaid flow.

---

## Screen 3 — You're All Set

Headline:

> **You're all set.**

Show an introductory financial summary:

```text
This month

Income        $5,240
Spending      $3,180
Money left    $2,060

Savings rate    39%
```

### Button

**See my finances**

→ Takes the user to Home.

---

# 7. HOME

Home is the most important screen in Budgts.

The primary question is:

> **How am I doing financially?**

The home screen should emphasize **Money Left and Savings Rate**, not just spending.

Recommended hierarchy:

1. Money Left
2. Savings Rate
3. Spending
4. Opportunities/insights
5. Upcoming obligations when available
6. Savings progress
7. Recent activity

---

## Home Header

Example:

> Good afternoon, Alex.

Secondary status:

> You're doing well this month.

Show a small Budgts cat/avatar near the header.

### Cat interaction

If the cat/avatar is clickable:

→ Opens the user's profile/account area or More menu.

Do not make the mascot clickable if there is no useful destination.

---

# 8. Home — Money Left Card

This is the primary card.

Example:

```text
Money left

$2,060

Income       $5,240
Spending     $3,180

39% savings rate
```

The large `$2,060` should dominate the card.

### Behavior

Use the existing Money Left calculation.

Do not redefine Money Left as a savings-account balance.

Supporting disclaimer where appropriate:

> Based on income minus spending — doesn't measure savings-account balances.

### Card interaction

**Money Left card**

→ Opens a financial detail view showing the month's income, spending, and Money Left components.

---

# 9. Home — Spending Card

Example:

```text
Spending

$3,180
↓ 8% from last month

Food                 $720
Housing            $1,100
Transportation       $340
Shopping              $310
Everything else       $710
```

Use a restrained chart/progress visualization.

### Button

**See spending**

→ Opens Budgets, filtered to the current month.

---

# 10. Home — Insight / Opportunity Card

This should be actionable rather than generic.

Example:

```text
Dining out

$286 this month
↑ $92 vs. your usual

Reducing this by $50/month
would keep $600 more per year.
```

### Button

**See spending**

→ Opens the relevant spending/category detail.

If a future insight has a dedicated action, that action should take the user directly to the relevant page rather than a generic Insights screen.

---

# 11. Home — Upcoming Section

This becomes more important once recurring/bill intelligence is implemented.

Example:

```text
Coming up

Netflix                 $15.99
Rent                  $1,100
Car insurance           $142

3 upcoming payments
```

### Button

**See all**

→ Opens the recurring/upcoming obligations view.

If recurring/bill intelligence is not yet available, do not show fake upcoming data. Hide the section or use an appropriate empty state.

---

# 12. Home — Savings Progress

Example:

```text
Savings

$2,060 kept

$2,060                 $3,000
●────────────────────────○

69% toward your goal
```

This can connect Money Left with savings goals while preserving the distinction between:

- Money Left
- Savings-account balance
- Savings goal progress

Do not imply that Money Left automatically equals cash transferred into a savings account.

### Button

**View goals**

→ Opens Savings Goals.

---

# 13. Home — Recent Activity

Only show the most useful recent activity.

Example:

```text
Recent activity

Whole Foods             -$48.32
Food · Groceries

Spotify                  -$9.99
Entertainment

Payroll               +$2,840
Income
```

### Button

**See all**

→ Opens Activity / Transactions.

Individual transaction row:

→ Opens Transaction Detail.

Recent activity should not dominate Home.

---

# 14. BUDGETS

The Budgets screen answers:

> **Where is my money going, and am I within the limits I've set?**

Header:

```text
September

$3,180 spent
$1,020 remaining

[ This month ] [ All time ]
```

Use segmented controls/tabs where useful.

---

# 15. Budget Category Cards

Example:

```text
Food

$720 / $900

██████████████░░░ 80%

$180 left
```

Another:

```text
Housing

$1,100 / $1,200

████████████████░ 92%

$100 left
```

Another:

```text
Transportation

$340 / $500

██████████░░░░░░ 68%

$160 left
```

### Category card interaction

Click/tap category card:

→ Opens Category Detail for that category and month.

Category detail should show:

- Total spending
- Budget
- Remaining
- Spending trend
- Transactions in that category
- Relevant insights
- Ability to edit the budget

---

# 16. Budgets — Add Budget

Use a clear `+` button in the Budgets header.

### `+` button

→ Opens Add/Edit Budget.

The user should select:

- Category
- Monthly budget amount

Then save.

### Save

→ Returns to Budgets and displays the newly configured budget.

### Cancel / Back

→ Returns to Budgets without changes.

---

# 17. BUDGET SETTER / FIRST-TIME BUDGET

Do not make users build an elaborate budget manually.

Budgts should suggest a starting point based on actual spending.

Headline:

> **Let's build your budget.**

Supporting text:

> Based on your recent spending, here's a starting point you can adjust.

Example:

```text
Food                    $850
Housing               $1,200
Transportation          $450
Shopping                $300
Entertainment           $180
Other                   $220

Suggested monthly spending
                       $3,200
```

### Buttons

**Looks good**

→ Saves/accepts the suggested budget and returns to Budgets.

**Customize**

→ Opens editable category-by-category budget setup.

### Customize screen

Each category amount should be editable.

### Continue / Save

→ Saves the budget and returns to Budgets.

### Back

→ Returns to the previous onboarding/budget step without saving changes.

The system should do as much of the initial setup automatically as possible.

---

# 18. CATEGORY DETAIL

Example:

```text
Food

$720 spent
$900 budget
$180 left

80%

This month
```

Then show:

- Spending trend
- Top merchants
- Recent transactions
- Comparison with previous period

### Buttons

**Change budget**

→ Opens the budget editor for this category.

**See transactions**

→ Opens Activity filtered to this category/month.

**Back**

→ Returns to Budgets.

---

# 19. ACTIVITY / TRANSACTIONS

Use **Activity** in navigation, but use **Transactions** as the page heading if clearer.

Primary purpose:

> Verify what Budgts recorded and correct exceptions.

Do not make this feel like the main product.

---

## Transaction List

Example:

```text
September 13

TODAY

Whole Foods                -$48.32
Food · Groceries

Spotify                     -$9.99
Entertainment


YESTERDAY

Payroll                  +$2,840
Income · Salary
```

Group by date.

Show:

- Merchant
- Amount
- Category
- Useful secondary information

Avoid overwhelming users with raw banking metadata.

---

# 20. Activity — Search and Filters

Provide a search field.

Search should find merchants/transaction descriptions.

Filters should include useful options such as:

- Date
- Category
- Account
- Income / spending
- Needs category
- Transfers

### Search

→ Filters the transaction list in place.

### Filter

→ Applies selected filters and updates the list.

### Clear filters

→ Restores the normal transaction list.

---

# 21. Activity — Needs Category

If transactions require categorization, provide a clear but non-intrusive review experience.

Example:

```text
Needs your attention

3 transactions need a category
```

Transaction card:

```text
DoorDash              -$27.43

What was this?

[ Food ] [ Other ]
```

### Category selection

→ Assigns the selected category using the existing categorization/update behavior.

### Transaction row/card

→ Opens Transaction Detail.

### "Needs category" filter

→ Shows only transactions that currently require categorization.

The user should not have to manually categorize transactions that the system can confidently categorize.

---

# 22. TRANSACTION DETAIL

Example:

```text
Whole Foods

-$48.32

September 12, 2026

Food
Groceries

Paid with
Chase Checking
```

Then:

```text
Merchant
Whole Foods

Category
Groceries

Date
Sep 12
```

Keep advanced/raw Plaid details hidden.

### Buttons

**Change category**

→ Opens category selector.

After selection:

→ Returns to Transaction Detail with updated category.

**Mark as transfer**

→ Opens/executes the existing transfer decision flow. If confirmation is required, show confirmation first.

**Remove transfer designation / Mark as not transfer**

→ Appears when the transaction is currently treated as a transfer and allows the user to override that classification according to existing product behavior.

**View transaction details**

→ Expands advanced transaction metadata/raw details.

**Back**

→ Returns to the previous transaction list/filter state.

---

# 23. CATEGORIZATION UX

The UI should reinforce the principle:

> The app does the bookkeeping. The user reviews, corrects, and plans.

When Budgts confidently knows the category:

- Show it.
- Do not ask the user.

When the category is uncertain:

- Make the exception easy to resolve.
- Remember the user's correction using the existing merchant-rule behavior where applicable.

Do not expose internal categorization machinery to normal users.

---

# 24. INSIGHTS

Insights should answer:

> **What can I change to save more?**

Do not make Insights merely a collection of charts.

Example:

```text
Your money story

$2,060
Money left

39%
Savings rate

↑ 6 pts vs. last month
```

Then:

```text
Where you could save

Dining out

$286 this month
↑ $92 vs. your usual

Reducing this by $50/month
would keep $600 more per year.
```

### Buttons

**See spending**

→ Opens relevant category/spending detail.

**See all insights**

→ Opens the full Insights view.

Insights should be understandable without financial expertise.

---

# 25. INSIGHTS — SPENDING TAB

Show:

- Total spending
- Month-over-month change
- Category breakdown
- Spending trend
- Largest changes
- Actionable opportunities

Example:

```text
Total spending

$3,180

↓ 8% vs. last month
```

### Chart

Use simple visualizations.

Do not overuse pie/donut charts.

Charts must answer a question rather than exist as decoration.

---

# 26. INSIGHTS — INCOME TAB

Show:

- Total income
- Income trend
- Income sources
- Month-over-month comparison

The UI should distinguish income from transfers and other non-income account movements according to the existing financial semantics.

---

# 27. INSIGHTS — NET WORTH TAB

Net worth should only be shown once the underlying net-worth functionality is implemented.

Do not fake or approximate net worth using Money Left.

When available:

- Assets
- Liabilities
- Net worth
- Trend

---

# 28. SAVINGS GOALS

Goals should feel motivating but grounded in real numbers.

Example:

```text
Savings goals

Emergency fund

$4,250 / $8,000

███████████░░░░

53%

$250 this month
```

Another:

```text
Vacation

$1,240 / $2,500

50%
```

### Buttons

**Add goal**

→ Opens Create Savings Goal.

**Goal card**

→ Opens Goal Detail.

---

# 29. CREATE SAVINGS GOAL

Fields:

- Goal name
- Target amount
- Optional target date
- Optional current amount, depending on existing goal functionality

### Button

**Create goal**

→ Saves the goal and opens Goal Detail or returns to Goals.

### Cancel

→ Returns to Goals without creating a goal.

---

# 30. GOAL DETAIL

Show:

```text
Emergency fund

$4,250 / $8,000

53%

Target
$8,000

Progress
$4,250
```

If supported by existing functionality, show:

- Monthly progress
- Target date
- Required monthly pace
- Historical progress

### Buttons

**Edit goal**

→ Opens goal editor.

**Back**

→ Returns to Savings Goals.

---

# 31. ACCOUNTS

Accounts should answer:

> **What money do I currently have, and what do I owe?**

Example:

```text
Accounts

Cash

Checking
$4,820

Savings
$12,450

Credit

Visa
-$1,240

────────────────

Total cash        $17,270
Credit owed        $1,240
```

Do not call this Net Worth unless actual net-worth semantics are implemented.

---

# 32. ACCOUNT DETAIL

Show:

- Account name
- Institution
- Account type
- Current available/balance information where supported
- Recent activity
- Connection status

### Buttons

**View transactions**

→ Opens Activity filtered to this account.

**Manage connection**

→ Opens the relevant Connected Banks/account management screen.

---

# 33. CONNECTED BANKS

This should feel trustworthy and transparent.

Example:

```text
Connected banks

┌────────────────────────────┐
│ Chase                      │
│                            │
│ Last synced 12 min ago     │
│ ✓ Everything looks good    │
│                            │
│ Manage accounts →          │
└────────────────────────────┘
```

Another:

```text
┌────────────────────────────┐
│ Advancial                  │
│                            │
│ ⚠ Review recommended       │
│                            │
│ Some activity from this    │
│ account is excluded from   │
│ financial totals.          │
│                            │
│ Review account →           │
└────────────────────────────┘
```

Use plain language.

---

# 34. CONNECTED BANKS — ACTIONS

### Connect a bank

→ Opens Plaid Link.

### Manage accounts

→ Opens account-level mapping/management.

### Reconnect

→ Opens the existing Plaid reconnect flow.

### Remove account

→ Opens the existing non-destructive account removal/management flow.

The UI should make clear that removing a connection does not necessarily mean deleting historical transaction records.

Do not introduce destructive deletion language unless the action is actually destructive.

---

# 35. ACCOUNT CALCULATION EXCLUSION

For accounts flagged for review, show:

> Some activity from this account is excluded from financial totals.

If the account is eligible for exclusion:

### Exclude from totals

→ Calls the existing account-level calculation exclusion action after appropriate confirmation if needed.

Once excluded:

### Include again

→ Removes the calculation exclusion and returns the account to financial calculations.

Important:

- `needs_review` is an advisory state.
- It must not silently suppress calculations.
- Account exclusion is an explicit owner action.
- Do not automatically exclude accounts based on a heuristic.
- Raw Transactions and CSV/export behavior should remain distinct from calculation exclusion.

---

# 36. SETTINGS

Organize Settings into clear sections.

## Your account

- Profile
- Email
- Security

## Your money

- Categories
- Budgets
- Savings goals
- Preferences

## Connected banks

- Connected banks
- Sync status
- Manage accounts

## App

- Notifications
- Appearance
- Help
- About Budgts

Bottom:

**Sign out**

---

# 37. SETTINGS — PROFILE

Show basic account information.

### Edit

→ Opens profile editor.

### Save

→ Saves changes and returns to Profile/Settings.

### Back

→ Returns to Settings.

Do not expose technical/internal identifiers.

---

# 38. SETTINGS — CATEGORIES

Show user-facing categories and category management supported by the current product.

### Category row

→ Opens category detail/editing where supported.

### Add category

→ Opens category creation if custom categories are supported.

Do not expose internal category IDs or implementation details.

---

# 39. SETTINGS — NOTIFICATIONS

Allow the user to control supported notifications.

Examples:

- Needs category
- Important account/sync issues
- Other supported financial notifications

Keep this concise.

---

# 40. SETTINGS — APPEARANCE

Use the Budgts design system.

Possible options:

- System
- Light
- Dark

If dark mode is not implemented, do not show a fake option.

---

# 41. SETTINGS — SECURITY

Make security reassurance easy to understand.

Example:

> **Your financial connections are protected.**

Explain in plain language what Budgts stores and how bank connections work without exposing unnecessary implementation details.

Avoid technical security claims that are not actually true.

---

# 42. MORE SCREEN

More should be a clean hub for secondary functionality.

Example:

```text
More

Savings Goals
Accounts
Insights

Connected Banks
Settings

Help
About Budgts
```

Each row is a navigation action.

### Savings Goals

→ Savings Goals.

### Accounts

→ Accounts.

### Insights

→ Insights.

### Connected Banks

→ Connected Banks.

### Settings

→ Settings.

### Help

→ Help/support screen.

### About Budgts

→ About screen.

---

# 43. HELP / SUPPORT

Keep simple.

Show:

- Common questions
- How Budgts works
- Bank connection help
- Categorization help
- Contact/support path if implemented

### Back

→ Returns to More.

---

# 44. ABOUT BUDGTS

Show:

- Budgts logo
- Mission
- Version
- Legal links where applicable

Example mission:

> **Simple money. Brighter tomorrows.**

### Back

→ Returns to More.

---

# 45. CAT MASCOT SYSTEM

Keep the Budgts cat as a recognizable brand asset.

Recommended expressions:

- Neutral
- Happy
- Curious
- Sleepy
- Concerned
- Celebrating

Use expressions contextually.

### Examples

Happy:

> Nice work!

Concerned:

> Spending is running a little high.

Curious:

> Want to see where that money went?

Celebrating:

> You're saving more than last month!

Sleepy:

> Nothing needs your attention.

The mascot should support the financial information, not compete with it.

Do not put a cat illustration on every card.

---

# 46. EMPTY STATES

Use friendly, useful empty states.

## No transactions

> Your activity will appear here once Budgts has imported your transactions.

Button:

**Connect a bank**

→ Opens Plaid Link.

## No budgets

> You don't have a budget yet.

Button:

**Build my budget**

→ Opens the budget setup flow.

## No goals

> Give your savings something to work toward.

Button:

**Create a goal**

→ Opens Create Savings Goal.

## No connected banks

> Connect a bank to bring your money into Budgts.

Button:

**Connect a bank**

→ Opens Plaid Link.

---

# 47. RESPONSIVE DESIGN

## Mobile

Optimize for:

- One-handed use
- Bottom navigation
- Large tap targets
- Vertical card layout
- Minimal secondary information
- Simple charts
- Clear financial numbers

## Desktop

Do not simply stretch the mobile UI.

Use:

- Persistent sidebar
- Wider cards
- Two-column dashboard where appropriate
- More information visible simultaneously
- More generous chart dimensions

Example:

```text
┌──────────────┬────────────────────────────────────────┐
│              │                                        │
│   BUDGTS     │ Good afternoon, Alex                  │
│              │                                        │
│   Home       │ ┌──────────────────────────────────┐   │
│   Budgets    │ │           MONEY LEFT             │   │
│   Activity   │ │            $2,060                │   │
│              │ │         39% savings rate         │   │
│   Goals      │ └──────────────────────────────────┘   │
│   Accounts   │                                        │
│   Insights   │ Spending             Budget            │
│              │ ┌────────────┐       ┌─────────────┐   │
│   Settings   │ │   chart    │       │ categories  │   │
│              │ └────────────┘       └─────────────┘   │
│              │                                        │
│              │ Recent activity                        │
└──────────────┴────────────────────────────────────────┘
```

---

# 48. COMPONENT SYSTEM

Create reusable components rather than page-specific one-off styling.

Recommended primitives:

- `AppShell`
- `MobileBottomNav`
- `DesktopSidebar`
- `PageHeader`
- `FinancialMetricCard`
- `MoneyLeftCard`
- `SavingsRate`
- `SpendingCard`
- `BudgetCategoryCard`
- `TransactionRow`
- `TransactionDetail`
- `InsightCard`
- `GoalCard`
- `AccountCard`
- `ConnectedBankCard`
- `ReviewBanner`
- `EmptyState`
- `CatMessage`
- `SegmentedControl`
- `ProgressBar`
- `CategoryIcon`
- `PrimaryButton`
- `SecondaryButton`
- `Danger/DestructiveButton` only where genuinely required

Components should share spacing, border radius, typography, and interaction behavior.

---

# 49. INTERACTION / BUTTON MAP

Use this as the implementation-level navigation reference.

| Current UI | Button / Action | Destination |
|---|---|---|
| Get Started | Get started | Bank connection onboarding |
| Get Started | Sign in | Authentication |
| Connect Bank | Connect a bank | Plaid Link |
| Onboarding complete | See my finances | Home |
| Home | Money Left card | Money Left detail |
| Home | See spending | Budgets/current-month spending |
| Home | View goals | Savings Goals |
| Home | Recent activity / See all | Activity |
| Home | Insight action | Relevant spending/category detail |
| Home | Upcoming / See all | Recurring/upcoming obligations |
| Budgets | `+` | Add Budget |
| Budgets | Category card | Category Detail |
| Budgets | This month | Current-month budget view |
| Budgets | All time | All-time budget/spending view |
| Budget Setup | Looks good | Save suggested budget → Budgets |
| Budget Setup | Customize | Editable budget setup |
| Category Detail | Change budget | Budget editor |
| Category Detail | See transactions | Activity filtered by category |
| Activity | Transaction row | Transaction Detail |
| Activity | Search | Filter current transaction list |
| Activity | Filter | Filter current transaction list |
| Activity | Clear filters | Reset transaction list |
| Activity | Needs category | Show transactions requiring categorization |
| Transaction Detail | Change category | Category selector |
| Transaction Detail | Mark as transfer | Transfer decision flow |
| Transaction Detail | View details | Advanced transaction metadata |
| Insights | See spending | Relevant spending detail |
| Insights | See all insights | Full Insights |
| Goals | Add goal | Create Savings Goal |
| Goals | Goal card | Goal Detail |
| Goal Detail | Edit goal | Goal editor |
| Accounts | Account | Account Detail |
| Account Detail | View transactions | Activity filtered by account |
| Connected Banks | Connect bank | Plaid Link |
| Connected Banks | Manage accounts | Account management |
| Connected Banks | Reconnect | Plaid reconnect |
| Connected Banks | Exclude from totals | Account calculation exclusion |
| Connected Banks | Include again | Remove calculation exclusion |
| More | Savings Goals | Savings Goals |
| More | Accounts | Accounts |
| More | Insights | Insights |
| More | Connected Banks | Connected Banks |
| More | Settings | Settings |
| More | Help | Help |
| More | About | About |
| Settings | Profile | Profile |
| Settings | Categories | Categories |
| Settings | Budgets | Budgets |
| Settings | Savings Goals | Savings Goals |
| Settings | Connected Banks | Connected Banks |
| Settings | Notifications | Notification settings |
| Settings | Appearance | Appearance settings |
| Settings | Security | Security |
| Settings | Sign out | Sign out/authentication flow |

---

# 50. FINANCIAL SEMANTICS MUST NOT CHANGE

The redesign is not permission to change financial behavior.

Preserve the existing semantics.

Important examples:

- Purchase = expense
- Refund = expense reversal
- Income = income
- Card payment = not spending
- Transfer = not spending
- Fees/interest charged = expense
- Money Left = income minus spending
- Savings Rate = Money Left / Income when income is positive
- Negative savings rates remain valid
- Savings rates above 100% remain valid
- No income → Savings Rate can be null
- Moving money between accounts does not automatically mean money was economically saved
- Credit-card payments must not double-count spending
- Duplicate Plaid records must not be silently deduplicated using an unsafe heuristic
- Calculation exclusion must remain an explicit account-level action
- Raw transaction history remains distinct from financial calculations

Do not modify the financial engine simply to make the UI easier.

---

# 51. PRODUCT HIERARCHY

The redesigned product should communicate this hierarchy:

```text
                    BUDGTS
                       │
                       ▼
               How am I doing?
                       │
                       ▼
                  MONEY LEFT
                       │
                       ▼
                SAVINGS RATE
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
         SPENDING             INCOME
             │
             ▼
       WHERE IT WENT
             │
             ▼
      WHAT CAN I CHANGE?
             │
             ▼
        SAVE MORE
```

The bookkeeping exists to make this picture trustworthy.

Transactions are important, but they should not become the center of the product.

---

# 52. What NOT to Do

Do not:

- Turn the dashboard into an accounting ledger
- Put every metric on the Home screen
- Make users manually categorize everything
- Ask users to manually create every budget if Budgts can reasonably suggest one
- Treat transfers as spending
- Treat credit-card payments as new spending
- Treat refunds as income
- Treat Money Left as a bank balance
- Call Money Left "Net Worth"
- Automatically exclude accounts based on a heuristic
- Hide account calculation exclusions from the user
- Expose Plaid/internal IDs in normal UI
- Overuse charts
- Overuse mascot illustrations
- Give every category a loud color
- Make desktop merely a stretched mobile layout
- Create navigation buttons that lead nowhere
- Change backend financial semantics as part of the visual redesign

---

# 53. Asset Implementation Requirements

Use the supplied assets as actual product assets, not merely as visual inspiration.

## `New Assets.svg`

Inspect the SVG and identify the reusable Budgts artwork it contains.

Prefer:

1. Reusing the supplied asset directly when technically appropriate.
2. Extracting/reusing contained artwork if the existing application asset pipeline requires individual files.
3. Preserving the supplied artwork's proportions and appearance.

Do not redraw the logo or cat if an appropriate supplied asset already exists.

## `New Branding guidelines.png`

Treat this as the visual source of truth for:

- Logo treatment
- Cat illustration style
- Color palette
- Typography
- Icon style
- Button styling
- Card styling
- Decorative shapes
- Voice/tone

The implementation should visibly feel like the same brand system shown in this guideline.

## Asset usage by screen

### Get Started

Use the supplied Budgts logo and a supplied cat/brand illustration.

Use brand decorative shapes sparingly around the hero area.

### Home

Use a small cat expression/message asset where useful.

Do not turn Home into a marketing illustration.

### Budgets

Use the supplied category icon language.

Category icons should feel like the examples in the brand guideline.

### Activity

Use the supplied icon style for transaction/category representation.

Keep the transaction list information-dense enough to be useful while maintaining the brand's rounded, friendly visual language.

### Savings Goals

This is an ideal location for the playful savings-oriented cat/illustration assets.

Use a stronger yellow/green brand treatment for progress and achievement.

### Insights

Use restrained charts with the brand palette.

Use cat/illustration moments for meaningful encouragement, not on every chart.

### Empty states

Use the supplied cat expressions and simple decorative shapes.

### Settings / Accounts / Connected Banks

Keep these more restrained and functional.

The brand should remain visible through typography, color, icons, radius, spacing, and small illustrations rather than large decorative artwork.

## Do not invent a competing visual language

Do not introduce:

- Generic SaaS gradients
- Glassmorphism
- Excessive neon
- Corporate banking blue-on-white styling
- Realistic finance illustrations
- Photographic stock imagery
- A second mascot
- A second typography system
- An unrelated icon family

The supplied Budgts brand should be unmistakable throughout the application.

# 54. Implementation Strategy

Implement this as a **cohesive UI redesign**, not as unrelated page-by-page cosmetic changes.

Recommended order:

## Step 1 — Design system

Establish:

- Colors
- Typography
- Spacing
- Radius
- Shadows
- Buttons
- Inputs
- Cards
- Navigation
- Icons
- Cat expressions
- Responsive breakpoints

## Step 2 — App shell

Implement:

- Desktop sidebar
- Mobile bottom navigation
- Page structure
- Global header
- Responsive behavior

## Step 3 — Home

Implement the new financial hierarchy first:

1. Money Left
2. Savings Rate
3. Spending
4. Insights/opportunities
5. Upcoming
6. Savings progress
7. Recent activity

## Step 4 — Budgets

Implement:

- Budget overview
- Category cards
- Budget setup
- Category detail
- Add/edit budget

## Step 5 — Activity

Implement:

- Transaction list
- Search
- Filters
- Needs Category
- Transaction Detail
- Categorization actions

## Step 6 — More / secondary screens

Implement:

- Savings Goals
- Accounts
- Insights
- Connected Banks
- Settings
- Help
- About

## Step 7 — Polish

Perform a complete responsive pass across:

- Mobile
- Tablet
- Desktop

Then verify:

- Navigation
- Buttons
- Loading states
- Empty states
- Error states
- Financial values
- Existing functionality
- Accessibility
- No regressions in financial logic

---

# 55. Engineering Constraint

This document defines a **UI/UX redesign**.

Do not rewrite or restructure the financial engine merely to support the new visual design.

Prefer existing APIs, server actions, selectors, calculations, components, and data structures.

If an existing screen does not expose enough information to implement the desired UI:

1. Identify the exact missing data.
2. Determine whether it already exists elsewhere.
3. Add the smallest necessary presentation-layer/API change.
4. Do not invent new financial semantics.

Any proposed financial-logic change should be treated as a separate architectural decision.

---

# 56. Definition of Done

The redesign is complete when:

- Every primary screen has a consistent Budgts visual language.
- Mobile and desktop layouts are intentionally designed.
- Home clearly communicates Money Left and Savings Rate.
- Budgets clearly communicate spending and remaining budget.
- Activity makes transaction review easy without dominating the product.
- Categorization exceptions are easy to resolve.
- Savings Goals are easy to understand and manage.
- Accounts and Connected Banks are transparent.
- Calculation exclusions are clearly communicated.
- Settings are organized and easy to navigate.
- Every major button has a clear destination/action.
- Empty/loading/error states are designed.
- Cat expressions are used consistently and sparingly.
- Existing financial calculations and semantics remain unchanged.
- Existing Plaid behavior remains intact.
- No destructive data behavior is introduced.
- No internal implementation details are unnecessarily exposed to users.
- The UI feels like one coherent product rather than a collection of redesigned pages.

---

# 57. Final Product Principle

Budgts should feel like a calm financial companion.

The user should be able to open the app and understand their situation within seconds:

> **Here's what you earned.**
>
> **Here's what you spent.**
>
> **Here's what you kept.**
>
> **Here's how you're doing.**
>
> **Here's where you could save more.**

Everything else exists to make those answers trustworthy and actionable.

**Simple money. Brighter tomorrows.**


# 58. Claude Implementation Note

The supplied branding guideline and assets supersede any conflicting visual instruction in earlier versions of this specification.

Before implementation:

1. Inspect `New Branding guidelines.png`.
2. Inspect `New Assets.svg`.
3. Identify which supplied assets can be used directly.
4. Establish the design tokens from the exact supplied palette.
5. Establish Nunito Sans as the application typeface.
6. Implement the shared design system before rebuilding individual screens.

Do not treat the branding guideline as optional inspiration. It is the source of truth for the Budgts visual identity.

The product's existing financial behavior and architecture remain the source of truth for financial semantics.
