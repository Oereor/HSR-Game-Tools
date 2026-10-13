import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'
export const ToolsPreset = definePreset(Aura, {
  primitive: {
    gold: {
      50: '#faf7ef',
      100: '#f3e9d5',
      200: '#e8d5ae',
      300: '#dbc08a',
      400: '#c9a86b',
      500: '#b89556',
      600: '#967640',
      700: '#755b33',
      800: '#59452b',
      900: '#3d3020',
      950: '#282016',
    },
    graphite: {
      0: '#ffffff',
      50: '#f1eee7',
      100: '#ddd9d0',
      200: '#c4c2bc',
      300: '#afb0b1',
      400: '#969aa3',
      500: '#717680',
      600: '#555b65',
      700: '#3b4049',
      800: '#2b2e34',
      900: '#22252b',
      950: '#17191d',
    },
  },
  semantic: {
    primary: Object.fromEntries(
      [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, `{gold.${n}}`]),
    ),
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.color}',
      offset: '3px',
      shadow: 'none',
    },
    formField: { borderRadius: '6px', paddingX: '0.75rem', paddingY: '0.625rem' },
    colorScheme: {
      dark: {
        surface: Object.fromEntries(
          [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [
            n,
            `{graphite.${n}}`,
          ]),
        ),
        primary: {
          color: '{gold.400}',
          contrastColor: '{graphite.950}',
          hoverColor: '{gold.300}',
          activeColor: '{gold.200}',
        },
        highlight: {
          background: '#c9a86b1a',
          focusBackground: '#c9a86b2b',
          color: '{gold.300}',
          focusColor: '{gold.200}',
        },
        text: {
          color: '{graphite.50}',
          hoverColor: '{graphite.0}',
          mutedColor: '{graphite.400}',
          hoverMutedColor: '{graphite.300}',
        },
        content: {
          background: '{graphite.950}',
          hoverBackground: '{graphite.900}',
          borderColor: '{graphite.700}',
        },
        formField: {
          background: '{graphite.900}',
          disabledBackground: '{graphite.800}',
          filledBackground: '{graphite.900}',
          borderColor: '{graphite.700}',
          hoverBorderColor: '{graphite.500}',
          focusBorderColor: '{gold.400}',
          color: '{graphite.50}',
          placeholderColor: '{graphite.400}',
        },
        overlay: {
          modal: {
            background: '{graphite.900}',
            borderColor: '{graphite.700}',
            color: '{graphite.50}',
          },
          popover: {
            background: '{graphite.800}',
            borderColor: '{graphite.700}',
            color: '{graphite.50}',
          },
        },
      },
    },
  },
  components: {
    tabs: { tab: { padding: '0.875rem 1rem', fontWeight: '500' }, tabpanel: { padding: '0' } },
    togglebutton: {
      colorScheme: {
        dark: {
          root: { checkedColor: '{primary.color}' },
          content: { checkedBackground: '{highlight.background}' },
        },
      },
    },
    button: { root: { borderRadius: '6px' } },
    splitter: {
      gutter: { background: '{surface.950}' },
      handle: { background: '{surface.700}', size: '36px' },
    },
  },
})
