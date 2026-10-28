import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ["Nunito", "system-ui", "sans-serif"],
        body: ["DM Sans", "system-ui", "sans-serif"],
        /** Calendar month titles — heavy geometric like the reference pages */
        calendar: ["Montserrat", "system-ui", "sans-serif"],
        /** Day digits — light geometric figures that stay even in width */
        digits: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        today: "hsl(var(--today))",
        weekend: "hsl(var(--weekend))",
        "month-stripe": "hsl(var(--month-stripe))",
        "month-divider": "hsl(var(--month-stripe))",
        "nav-bg": "hsl(var(--nav-bg))",
        "calendar-accent": "hsl(var(--calendar-accent))",
        "list-accent": "hsl(var(--list-accent))",
        member: {
          blue: "hsl(var(--member-blue))",
          peach: "hsl(var(--member-peach))",
          lavender: "hsl(var(--member-lavender))",
          mint: "hsl(var(--member-mint))",
          rose: "hsl(var(--member-rose))",
          yellow: "hsl(var(--member-yellow))",
        },
        daypart: {
          morning: "hsl(var(--morning))",
          "late-morning": "hsl(var(--late-morning))",
          afternoon: "hsl(var(--afternoon))",
          evening: "hsl(var(--evening))",
          night: "hsl(var(--night))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
        "3xl": "calc(var(--radius) + 16px)",
      },
      boxShadow: {
        soft: "0 2px 12px -2px hsl(340 30% 85% / 0.4)",
        "soft-lg": "0 4px 24px -4px hsl(340 30% 85% / 0.5)",
        nav: "0 -4px 20px -4px hsl(340 30% 85% / 0.3)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;