/// <reference types="vite/client" />

// Image module declarations
declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.webp" {
  const value: string;
  export default value;
}

// JSX module declarations
declare module "*.jsx" {
  const component: React.ComponentType<any>;
  export default component;
}

// JS module declarations
declare module "*.js" {
  const component: React.ComponentType<any>;
  export default component;
}

// Portal component declaration
declare module "../Common/Portal" {
  const Portal: React.ComponentType<any>;
  export default Portal;
}

declare module "components/Common/Portal" {
  const Portal: React.ComponentType<any>;
  export default Portal;
}

// React Helmet declaration
declare module "react-helmet" {
  export const Helmet: React.ComponentType<any>;
}
