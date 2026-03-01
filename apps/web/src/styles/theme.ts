import type { ThemeConfig } from 'antd';

/**
 * Ant Design 5 theme configuration.
 * Primary blue color, compact spacing tuned for a school portal.
 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 8,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    colorBgLayout: '#f5f5f5',
  },
  components: {
    Layout: {
      siderBg: '#001529',
      headerBg: '#ffffff',
      bodyBg: '#f5f5f5',
    },
    Menu: {
      darkItemBg: '#001529',
      darkItemSelectedBg: '#1677ff',
    },
    Card: {
      borderRadiusLG: 12,
    },
    Table: {
      borderRadiusLG: 8,
    },
    Tag: {
      borderRadiusSM: 4,
    },
  },
};
