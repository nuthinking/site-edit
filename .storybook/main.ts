import type { StorybookConfig } from "@storybook/react-vite";

// Private dev tool for the widget's states and theme: `npm run storybook`. Nothing here ships.
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../stories/**/*.stories.tsx"],
};

export default config;
