import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
      },
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "rgb(209 213 219)", // gray-300
            "--tw-prose-headings": "rgb(255 255 255)", // white
            "--tw-prose-lead": "rgb(156 163 175)", // gray-400
            "--tw-prose-links": "rgb(167 139 250)", // violet-400
            "--tw-prose-bold": "rgb(255 255 255)", // white
            "--tw-prose-counters": "rgb(156 163 175)", // gray-400
            "--tw-prose-bullets": "rgb(107 114 128)", // gray-500
            "--tw-prose-hr": "rgb(55 65 81)", // gray-700
            "--tw-prose-quotes": "rgb(229 231 235)", // gray-200
            "--tw-prose-quote-borders": "rgb(139 92 246)", // violet-500
            "--tw-prose-captions": "rgb(156 163 175)", // gray-400
            "--tw-prose-code": "rgb(255 255 255)", // white
            "--tw-prose-pre-code": "rgb(229 231 235)", // gray-200
            "--tw-prose-pre-bg": "rgb(17 24 39)", // gray-900
            "--tw-prose-th-borders": "rgb(75 85 99)", // gray-600
            "--tw-prose-td-borders": "rgb(55 65 81)", // gray-700
          },
        },
        blog: {
          css: {
            // Base text
            fontSize: "1.125rem", // 18px
            lineHeight: "1.75", // 28px line height for body

            // Paragraphs
            p: {
              marginTop: "1.5em",
              marginBottom: "1.5em",
              lineHeight: "1.75",
            },

            // First paragraph after heading - tighter spacing
            "h2 + p, h3 + p, h4 + p": {
              marginTop: "0.75em",
            },

            // Headings
            h2: {
              fontSize: "1.5em", // 27px
              fontWeight: "700",
              lineHeight: "1.3",
              marginTop: "2.5em",
              marginBottom: "0.75em",
              letterSpacing: "-0.025em",
            },

            h3: {
              fontSize: "1.25em", // 22.5px
              fontWeight: "600",
              lineHeight: "1.4",
              marginTop: "2em",
              marginBottom: "0.5em",
            },

            h4: {
              fontSize: "1.125em",
              fontWeight: "600",
              lineHeight: "1.5",
              marginTop: "1.75em",
              marginBottom: "0.5em",
            },

            // Lists
            ul: {
              marginTop: "1.25em",
              marginBottom: "1.25em",
              paddingLeft: "1.5em",
            },

            ol: {
              marginTop: "1.25em",
              marginBottom: "1.25em",
              paddingLeft: "1.5em",
            },

            li: {
              marginTop: "0.625em",
              marginBottom: "0.625em",
              lineHeight: "1.65",
            },

            "li p": {
              marginTop: "0.5em",
              marginBottom: "0.5em",
            },

            // Nested lists
            "ul ul, ol ol, ul ol, ol ul": {
              marginTop: "0.5em",
              marginBottom: "0.5em",
            },

            // Strong/bold within list items
            "li strong": {
              fontWeight: "600",
            },

            // Links
            a: {
              fontWeight: "500",
              textDecoration: "none",
              borderBottom: "1px solid rgb(167 139 250 / 0.3)",
              transition: "border-color 0.15s ease",
              "&:hover": {
                borderBottomColor: "rgb(167 139 250)",
              },
            },

            // Strong
            strong: {
              fontWeight: "600",
            },

            // Emphasis
            em: {
              fontStyle: "italic",
            },

            // Blockquotes
            blockquote: {
              fontStyle: "italic",
              fontWeight: "400",
              borderLeftWidth: "3px",
              borderLeftColor: "rgb(139 92 246)", // violet-500
              paddingLeft: "1.25em",
              marginTop: "1.75em",
              marginBottom: "1.75em",
            },

            "blockquote p": {
              marginTop: "0",
              marginBottom: "0",
            },

            // Horizontal rules
            hr: {
              marginTop: "3em",
              marginBottom: "3em",
              borderColor: "rgb(55 65 81)", // gray-700
            },

            // Code
            code: {
              fontSize: "0.875em",
              fontWeight: "500",
              backgroundColor: "rgb(31 41 55)", // gray-800
              padding: "0.25em 0.375em",
              borderRadius: "0.25em",
            },

            "code::before": {
              content: '""',
            },

            "code::after": {
              content: '""',
            },

            // Pre blocks
            pre: {
              marginTop: "1.75em",
              marginBottom: "1.75em",
              borderRadius: "0.5em",
              padding: "1em 1.25em",
              overflowX: "auto",
            },

            "pre code": {
              backgroundColor: "transparent",
              padding: "0",
              fontSize: "0.875em",
              lineHeight: "1.7",
            },
          },
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
