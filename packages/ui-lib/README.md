# Eka Web Design Components

A comprehensive design system and component library for building modern web applications with consistent design patterns and reusable components.

## 🎯 Overview

Eka Web Design Components provides a collection of base components that serve as the foundation for building web applications with a consistent, accessible, and maintainable design system. These components are built with modern web standards and best practices in mind.

## 📦 Core Components

### Layout Components
- **Container** - Responsive container with max-width and padding
- **Grid** - CSS Grid-based layout system
- **Flex** - Flexbox-based layout utilities
- **Stack** - Vertical spacing component
- **Cluster** - Horizontal spacing component

### Navigation Components
- **Header** - Main site header with navigation
- **Navbar** - Navigation bar component
- **Sidebar** - Collapsible sidebar navigation
- **Breadcrumb** - Breadcrumb navigation
- **Pagination** - Page navigation component

### Form Components
- **Button** - Primary, secondary, and tertiary button variants
- **Input** - Text input with various types and states
- **Select** - Dropdown select component
- **Checkbox** - Checkbox input component
- **Radio** - Radio button component
- **Textarea** - Multi-line text input
- **Form** - Form wrapper with validation

### Display Components
- **Card** - Content container with shadow and border
- **Modal** - Overlay dialog component
- **Tooltip** - Hover tooltip component
- **Badge** - Status and label indicators
- **Avatar** - User profile image component
- **Icon** - Icon component system

### Feedback Components
- **Alert** - Success, warning, error, and info alerts
- **Toast** - Notification toast messages
- **Progress** - Progress bar component
- **Spinner** - Loading spinner component
- **Skeleton** - Loading skeleton component

### Data Display Components
- **Table** - Data table component
- **List** - Ordered and unordered lists
- **Accordion** - Collapsible content sections
- **Tabs** - Tabbed content interface
- **Timeline** - Timeline component

## 🚀 Getting Started

### Installation

```bash
npm install @eka/web-components
# or
yarn add @eka/web-components
```

### Basic Usage

```javascript
import { Button, Card, Container } from '@eka/web-components';

function App() {
  return (
    <Container>
      <Card>
        <h1>Welcome to Eka</h1>
        <Button variant="primary">Get Started</Button>
      </Card>
    </Container>
  );
}
```

## 🎨 Design Tokens

The component library uses a comprehensive design token system:

### Colors
- **Primary**: Brand primary colors
- **Secondary**: Supporting brand colors
- **Neutral**: Grayscale colors
- **Semantic**: Success, warning, error, info colors

### Typography
- **Font Families**: Primary and secondary font stacks
- **Font Sizes**: Consistent scale from xs to 4xl
- **Font Weights**: Light, normal, medium, semibold, bold
- **Line Heights**: Optimized for readability

### Spacing
- **Scale**: 4px base unit system
- **Sizes**: xs, sm, md, lg, xl, 2xl, 3xl, 4xl

### Breakpoints
- **Mobile**: 320px - 767px
- **Tablet**: 768px - 1023px
- **Desktop**: 1024px - 1439px
- **Large Desktop**: 1440px+

## 🔧 Customization

### Theme Configuration

```javascript
import { createTheme } from '@eka/web-components';

const customTheme = createTheme({
  colors: {
    primary: {
      50: '#eff6ff',
      500: '#3b82f6',
      900: '#1e3a8a',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
});
```

### Component Variants

Each component supports multiple variants and sizes:

```javascript
<Button variant="primary" size="lg">
  Large Primary Button
</Button>

<Card variant="elevated" padding="lg">
  Elevated Card with Large Padding
</Card>
```

## ♿ Accessibility

All components are built with accessibility in mind:

- **ARIA Labels**: Proper ARIA attributes for screen readers
- **Keyboard Navigation**: Full keyboard support
- **Focus Management**: Proper focus handling
- **Color Contrast**: WCAG AA compliant color ratios
- **Semantic HTML**: Proper HTML semantics

## 📱 Responsive Design

Components are built to be responsive by default:

- **Mobile-First**: Designed for mobile devices first
- **Flexible Layouts**: Adapt to different screen sizes
- **Touch-Friendly**: Optimized for touch interactions
- **Performance**: Optimized for various device capabilities

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run visual regression tests
npm run test:visual

# Run accessibility tests
npm run test:a11y
```

## 📚 Documentation

- **Storybook**: Interactive component documentation
- **API Reference**: Detailed component APIs
- **Examples**: Real-world usage examples
- **Migration Guide**: Version migration guides

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/eka/web-design-components.git

# Install dependencies
npm install

# Start development server
npm run dev

# Build components
npm run build
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/eka/web-design-components/issues)
- **Discussions**: [GitHub Discussions](https://github.com/eka/web-design-components/discussions)
- **Documentation**: [Component Documentation](https://eka-design-system.com)

---

Built with ❤️ by the Eka Design Team 