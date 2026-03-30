# Hackonomics-2026

Hackonomics is a React + Vite financial dashboard app focused on personal finance workflows:
- Loans and payoff analysis
- Cash flow tracking
- Investing portfolio tracking
- Financial planner/advice page
- Highly interactive dashboard visuals and UI effects

Repository: [leesangyeon1/Hackonomics-2026](https://github.com/leesangyeon1/Hackonomics-2026)

## 1) How to run

### Requirements
- Node.js `20.19+` or `22.12+`
- npm `10+`

### Install and start (development)

```bash
git clone https://github.com/leesangyeon1/Hackonomics-2026.git
cd Hackonomics-2026/finance-web
npm install
npm run dev
```

Then open the local URL shown by Vite (typically `http://localhost:5173`).

### Production build and preview

```bash
cd finance-web
npm run build
npm run preview
```

## 2) Project structure

```text
Hackonomics-2026/
├─ finance-web/
│  ├─ public/                 # Static assets
│  ├─ src/
│  │  ├─ App.jsx              # Main single-page app flow and page routing logic
│  │  ├─ main.jsx             # React app entry point
│  │  ├─ index.css            # Global styling
│  │  ├─ MagicBento.*         # Dashboard card interaction/effect layer
│  │  ├─ SplitText.*          # Header split-letter animation
│  │  ├─ ShinyText.*          # Shiny text effect for headings/metrics
│  │  ├─ GradientText.*       # Animated gradient text wrapper
│  │  ├─ BorderGlow.*         # Edge-sensitive border glow card wrapper
│  │  ├─ Prism.*              # Main shell prism shader background
│  │  ├─ GridScan.*           # Financial advice background effect
│  │  ├─ FloatingLines.*      # Cash flow background effect
│  │  └─ assets/              # Local app assets
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.js
├─ LICENSE
└─ README.md
```

## 3) What we used

### Core app stack
- **React 19** for UI and state management
- **Vite** for fast dev server and build
- **ESLint** for linting

### Data visualization
- **Recharts** for line/area charts and financial chart rendering

### Animation and effects
- **GSAP** (`gsap`, `@gsap/react`) for text and UI motion
- **Three.js** + **postprocessing** for shader/effect backgrounds
- **OGL** for the prism-style shell shader
- Custom CSS and canvas/shader-based visual systems

## 4) NPM scripts

From `finance-web/`:

```bash
npm run dev      # Start local dev server (HMR)
npm run lint     # Run ESLint
npm run build    # Build production bundle into dist/
npm run preview  # Preview production build locally
```

## 5) Notes for contributors

- Main application behavior is centralized in `src/App.jsx`.
- Several UI effects are page-scoped (for example, planner vs. cash flow backgrounds).
- Keep new features modular in `src/` and wire them through `App.jsx`.
- Run `npm run build` before opening a PR to catch integration errors early.
