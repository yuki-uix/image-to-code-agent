---
name: image-to-code
description: >
  Converts a screenshot or UI image into a self-contained, browser-ready HTML file
  that faithfully reproduces the visual design — colors, layout, typography, cards,
  buttons, and all visible text. No build step, no dependencies, no Ollama required.
  Opens instantly in any browser.

  Use this skill whenever the user provides a screenshot, mockup, or image file and
  asks you to turn it into code, recreate the design, generate HTML from an image,
  or build a page that looks like the screenshot. Trigger phrases include: "turn this
  into code", "generate HTML for this", "recreate this design", "image to code",
  "screenshot to code", "/image-to-code".
---

# image-to-code

Turn any UI screenshot into a self-contained HTML file that looks like the original.

## Usage

```
/image-to-code <image-path> [--out <output-path>]
```

- `<image-path>` — path to the screenshot (PNG, JPG, WebP, etc.) — **required**
- `--out <output-path>` — where to write the HTML (default: same directory as image, same filename with `.html` extension)

## What to do

### Step 1 — Parse arguments

Extract the image path from the user's message or the `args` string. Also check for `--out`. If no image path is provided, ask for one before proceeding.

### Step 2 — Read and analyze the image

Use the Read tool to load the image. Study it carefully before writing any code. For each section of the design, identify:

- **Colors**: exact background colors per section (hero, cards, banners), text colors, accent/highlight colors, border colors. Be specific — note whether something is near-black (#1a1a1a), pure white, lime green (#b5ff47), etc.
- **Layout**: the overall page structure (column of sections), how each section is arranged (2-column flex, 2×2 grid, 3-column grid, etc.), approximate proportions
- **Typography**: heading sizes (is the h1 large and bold? medium?), body text weight and size, any visible font family clues
- **Components**: nav bar contents and style, hero headline and subtext, card styles (border? shadow? dark background?), button styles (filled/outlined, rounded corners, color), logo or brand name, client logo rows, CTA banners
- **Text content**: copy every visible word — brand name, nav links, headlines, body text, button labels, card titles, descriptions, footer text

The goal is to have a complete picture before writing a single line of HTML.

### Step 3 — Generate the HTML

Write a single self-contained HTML file. Use this stack:

```html
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.25.6/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
```

And if a specific font is visible (e.g. Inter, Poppins, DM Sans), add a Google Fonts link.

**Visual fidelity rules:**

- **Colors**: use Tailwind arbitrary values like `bg-[#b5ff47]` or `text-[#1a1a1a]` for exact matches. Don't round to the nearest named Tailwind color — use the real hex.
- **Layout**: match the grid/flex structure. A 2×2 card grid → `grid grid-cols-2 gap-4`. A 3-column dark section → `grid grid-cols-3`. A flex nav with space-between → `flex justify-between items-center`.
- **Card styles**: if cards alternate between dark (`bg-[#1a1a1a]`) and light (`bg-white border`), reproduce that alternation.
- **Spacing**: approximate the visible padding and gaps using Tailwind spacing. Don't default to `p-4` everywhere — look at the image.
- **Text**: use every visible word verbatim. Never invent placeholder text.
- **Illustrations**: if decorative illustrations or icons are present, create simple SVG approximations. Don't skip sections because they contain an image — add a placeholder that suggests the shape and color.

**Code structure:**

```jsx
// Define data at the top (services array, case studies array, etc.)
const services = [...];

// Define components (NavBar, HeroSection, ServiceCard, etc.)
function NavBar() { ... }
function HeroSection() { ... }
// ...

// Page root
function Page() {
  return (
    <div className="...">
      <NavBar />
      <HeroSection />
      ...
    </div>
  );
}

// Mount
ReactDOM.createRoot(document.getElementById('root')).render(<Page />);
```

Use `type="text/babel"` on the script tag (not `type="module"`).

### Step 4 — Write and confirm

Write the file to the output path. Then tell the user:

- The output file path
- A one-line summary of what was generated (e.g. "Marketing landing page with nav, hero, 2×2 service cards, CTA banner, and case study section")
- Mention they can open the file directly in a browser — no build step needed

## Quality bar

The output should look recognizably like the original screenshot when opened in a browser. The most common mistakes to avoid:

- **Wrong colors**: defaulting to blue/gray Tailwind colors instead of the actual palette
- **Wrong layout**: rendering a grid as a list, or missing a multi-column structure
- **Missing text**: skipping body copy or button labels because they seemed unimportant
- **Generic placeholders**: writing "Service 1", "Card Title", "Lorem ipsum" — never do this
- **Nesting problems**: wrapping all sections inside the hero section or navbar

If you're uncertain about a color or layout detail, make your best judgment and note it — don't omit the section.
