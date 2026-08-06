---
name: AguaViento
colors:
  surface: '#f9f9f6'
  surface-dim: '#dadad7'
  surface-bright: '#f9f9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f1'
  surface-container: '#eeeeeb'
  surface-container-high: '#e8e8e5'
  surface-container-highest: '#e2e3e0'
  on-surface: '#1a1c1b'
  on-surface-variant: '#40493d'
  inverse-surface: '#2f312f'
  inverse-on-surface: '#f1f1ee'
  outline: '#707a6c'
  outline-variant: '#bfcaba'
  surface-tint: '#1b6d24'
  primary: '#0d631b'
  on-primary: '#ffffff'
  primary-container: '#2e7d32'
  on-primary-container: '#cbffc2'
  inverse-primary: '#88d982'
  secondary: '#00629e'
  on-secondary: '#ffffff'
  secondary-container: '#62b4fe'
  on-secondary-container: '#004470'
  tertiary: '#6d4e45'
  on-tertiary: '#ffffff'
  tertiary-container: '#87665c'
  on-tertiary-container: '#ffede9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a3f69c'
  primary-fixed-dim: '#88d982'
  on-primary-fixed: '#002204'
  on-primary-fixed-variant: '#005312'
  secondary-fixed: '#cfe5ff'
  secondary-fixed-dim: '#99cbff'
  on-secondary-fixed: '#001d34'
  on-secondary-fixed-variant: '#004a78'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#e7bdb1'
  on-tertiary-fixed: '#2c160e'
  on-tertiary-fixed-variant: '#5d4037'
  background: '#f9f9f6'
  on-background: '#1a1c1b'
  surface-variant: '#e2e3e0'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  data-display:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  touch-target-min: 48px
  gutter: 16px
  margin-mobile: 16px
  margin-tablet: 32px
  stack-sm: 4px
  stack-md: 12px
  stack-lg: 24px
---

## Brand & Style

The design system is engineered for utility and resilience, specifically tailored for field technicians operating in the expansive rural landscapes of Argentina. The brand personality is **rugged, dependable, and precise**, mirroring the mechanical nature of wind pumps (molinos) and the critical importance of water management.

The visual style is a hybrid of **Modern Corporate** and **High-Contrast Utility**. It prioritizes immediate legibility under harsh sunlight and ease of use for technicians who may be wearing gloves or working in dusty environments. The UI avoids decorative flourishes in favor of a "tools-first" aesthetic: thick borders for clarity, large touch targets for physical accessibility, and a distinct lack of ambiguity in state changes. The emotional response is one of confidence—the app is a reliable tool in the technician's kit, not a distraction.

## Colors

The palette is rooted in the environment of the Argentine campo. 

- **Primary (Deep Field Green):** Used for primary actions, success states, and the core identity of the service.
- **Secondary (Water Blue):** Reserved for water-related data, tank levels, and navigation elements related to flow.
- **Earthy Tones:** A specific "Earth" neutral is used for page backgrounds to reduce screen glare and provide a softer contrast than pure white, while remaining professional.
- **Accents (Warning/Alert):** High-saturation oranges and yellows are strictly reserved for critical maintenance alerts, low-pressure warnings, and urgent repair tasks to ensure they stand out against the green/blue functional UI.
- **High Contrast:** Text and iconography must maintain a minimum contrast ratio of 7:1 against backgrounds to ensure readability in high-glare outdoor conditions.

## Typography

The design system utilizes **Inter** for its exceptional legibility and systematic weight distribution. 

- **Data Focus:** A specific `data-display` style is used for numerical values (e.g., liters per hour, wind speed, RPM) to ensure they are the most prominent elements on the screen.
- **Hierarchical Clarity:** Headlines use tight letter spacing and heavy weights to anchor sections.
- **Readability:** Body text is set with generous line height to prevent eye fatigue during long reporting sessions. 
- **Spanish Optimization:** Line heights are adjusted to accommodate common Spanish diacritics (accents and tildes) without clipping.

## Layout & Spacing

This design system follows a **fluid grid** model optimized for mobile-first field use. 

- **Touch-First Geometry:** Every interactive element must adhere to a minimum 48x48px touch target. 
- **The 8px Rhythm:** All spacing (padding, margins, gaps) is a multiple of 8px to ensure a consistent vertical rhythm.
- **Mobile Layout:** A single-column layout is preferred for task lists and data entry forms. Complex data tables should reflow into card-based lists on mobile devices.
- **Safe Areas:** Padding is increased at the bottom of screens to account for system gestures and thumb-reachability during one-handed use in the field.

## Elevation & Depth

To maintain a rugged and professional feel, this design system avoids soft, atmospheric shadows. Instead, it utilizes **Tonal Layers** and **Defined Outlines**:

- **Surfaces:** The background uses the Earthy neutral (#EFEBE9), while interactive cards use Pure White (#FFFFFF). This creates a natural "lift" without the need for heavy shadows.
- **Borders:** Active states and "Action Cards" use a 2px solid border in the primary color rather than a shadow. This ensures the element's boundaries are visible even if the screen brightness is lowered to save battery.
- **Physicality:** High-priority buttons use a subtle bottom-heavy border (1-2px darker than the button color) to give them a tactile, "pressable" appearance reminiscent of physical machinery buttons.

## Shapes

The shape language is **Soft (0.25rem)**. 

- This slight rounding prevents the UI from feeling aggressive or dated while maintaining a structured, industrial appearance. 
- **Cards and Containers:** Use a 0.5rem (8px) radius to differentiate them clearly from the background.
- **Status Indicators:** Icons and small badges use a fully circular (pill) shape to distinguish them from functional buttons.

## Components

### Buttons
- **Primary:** Solid Deep Field Green with white text. High-contrast, 2px border in a darker shade for tactile feedback.
- **Secondary:** Outlined Water Blue. Used for non-critical actions like "Ver Mapa" or "Descargar Reporte."
- **Urgent/SOS:** Solid Warning Orange. High-visibility for reporting accidents or major mechanical failures.

### Input Fields
- Heavy 2px borders for clear definition.
- Floating labels that never disappear, ensuring the technician knows exactly what they are measuring (e.g., "Nivel de Tanque (L)").
- Numeric inputs should trigger a large-button number pad by default.

### Task Cards
- Cards feature a color-coded "Status Stripe" on the left edge (Green for Scheduled, Yellow for Pending, Orange for Urgent).
- Key data points (Location, Molino ID) are displayed in `label-bold`.

### Chips & Badges
- Used for status filtering (e.g., "Reparado", "Pendiente", "En Camino").
- Colors must correspond exactly to the Brand Status colors defined in the palette.

### Icons
- Use thick-stroke (2px) icons. 
- Visual metaphors: Windmills for equipment, water drops for flow/tanks, wrench for maintenance, and Map markers for location. Avoid thin or illustrative line art.

### Custom Component: Tank Gauge
- A visual progress bar using Water Blue (#0277BD) to indicate current water levels against capacity, providing an immediate visual status without reading text.