// ====================================================================================
//
// FILE:               /src/components/shared/Button.jsx
//
// OVERVIEW:
//   This is the primary, application-wide Button component. It acts as a wrapper
//   around the Shadcn/ui Button, providing a centralized and consistent implementation
//   for all buttons in the application. It's designed to handle common states like
//   loading and disabled, and can render with or without an icon.
//
// KEY FEATURES:
//   - Centralized Styling: All button logic and styling are in one place, making
//     sitewide changes easy.
//   - Loading State: Has a built-in loading state that shows a spinner and disables
//     the button, providing clear user feedback.
//   - Icon Support: Easily renders an icon before the button text.
//   - Type-Safe & Reusable: Built on top of the robust and accessible Shadcn/ui
//     button component.
//
// HOW TO GUIDE:
//   1. Import the component: `import { Button } from '@/components/shared/Button';`
//   2. Use it in your JSX:
//      - Basic: `<Button>Click Me</Button>`
//      - With Icon: `<Button Icon={PlayCircle}>Run Script</Button>`
//      - Loading State: `<Button isLoading={true}>Running...</Button>`
//      - Disabled: `<Button disabled={true}>Cannot Run</Button>`
//      - Different Styles: `<Button variant="destructive">Delete</Button>`
//
// ====================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import React from 'react';
import { Loader2 } from 'lucide-react'; // A nice spinner icon from lucide
// Import the base button component that Shadcn/ui created for us.
import { Button as ShadcnButton } from '@/components/ui/button';

// SECTION 2: MAIN BUTTON COMPONENT DEFINITION
// -------------------------------------------------------------------------------------------------
/**
 * The application's primary button component.
 *
 * @param {object} props - The component props.
 * @param {React.ReactNode} props.children - The text or content to display inside the button.
 * @param {React.ElementType} [props.Icon=null] - An optional icon component (e.g., from lucide-react).
 * @param {boolean} [props.isLoading=false] - If true, shows a loading spinner and disables the button.
 * @param {object} ...props - Any other props will be passed down to the underlying Shadcn button (e.g., `onClick`, `disabled`, `variant`, `className`).
 * @returns {React.ReactElement}
 */
export const Button = ({
  children,
  Icon = null,
  isLoading = false,
  ...props
}) => {
  // Determine if the button should be in a disabled state, either because
  // it's loading or because the `disabled` prop was explicitly passed.
  const isDisabled = isLoading || props.disabled;

  return (
    // We pass all props, including our calculated `disabled` state, down to the
    // Shadcn button. This makes our component a flexible and powerful wrapper.
    <ShadcnButton disabled={isDisabled} {...props}>
      {/* If isLoading is true, we render the spinner icon. */}
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}

      {/* If not loading, and an Icon was provided, render the icon. */}
      {!isLoading && Icon && <Icon className="mr-2 h-4 w-4" />}

      {/* Render the button's main text content. */}
      {children}
    </ShadcnButton>
  );
};
