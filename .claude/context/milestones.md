# Visual SCXML Editor - Development Milestones

This document outlines the 5-milestone development plan for converting the Visual SCXML Editor from a VS Code plugin to a standalone web application.

## Overview

Each milestone builds upon the previous one with clear deliverables and success criteria. The timeline is designed for systematic development with testable outcomes at each stage.

**Total Timeline:** 5 weeks (1 milestone per week)  
**Reference:** [CLAUDE.md](./CLAUDE.md) - Complete project specifications

---

## 🎯 MILESTONE 1: Core Foundation & Basic SCXML Support

**Duration:** Week 1  
**Goal:** Establish project foundation with basic SCXML parsing and editing

### Features to Implement
- Next.js 14 TypeScript project setup with proper folder structure
- Basic SCXML parsing and validation engine using `fast-xml-parser`
- Monaco Editor integration with XML syntax highlighting
- File import/export functionality (load/save SCXML files)
- Basic error handling and validation feedback
- TypeScript types for core SCXML elements

### Technical Tasks
1. Initialize Next.js project with TypeScript, Tailwind CSS, and ESLint
2. Set up project folder structure (components, lib, types, stores)
3. Install and configure Monaco Editor with React wrapper
4. Implement basic SCXML parser with TypeScript interfaces
5. Create file upload/download functionality
6. Set up basic error boundary and validation system
7. Write initial unit tests for parser

### Deliverables
- ✅ Working Next.js application running on localhost
- ✅ SCXML file can be loaded, edited as XML text, and saved
- ✅ Basic XML syntax highlighting in Monaco Editor
- ✅ TypeScript types for State, Transition, Event, Action elements
- ✅ File import/export with proper error handling

### Success Criteria
User can:
- Load an SCXML file from their computer
- Edit it as XML text with syntax highlighting
- Save changes back to a file
- See basic validation errors for malformed XML

### Dependencies & Libraries
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "@monaco-editor/react": "^4.6.0",
    "fast-xml-parser": "^4.3.2",
    "xml-formatter": "^3.6.0",
    "lucide-react": "^0.294.0"
  }
}
```

---

## 🎯 MILESTONE 2: Two-Tab Interface & Visual Metadata System

**Duration:** Week 2  
**Goal:** Create the dual-view architecture with metadata preservation

### Features to Implement
- Two-tab interface switching between Code Editor and Visual Diagram
- Non-intrusive visual metadata namespace implementation
- Basic state machine diagram rendering using D3.js/SVG
- Real-time synchronization between code and visual tabs
- Visual metadata injection/extraction system
- Basic state and transition visualization (boxes and arrows)

### Technical Tasks
1. Implement tab-based layout with `react-tabs` or custom solution
2. Set up D3.js with React for SVG diagram rendering
3. Create visual metadata namespace handler (`xmlns:visual`)
4. Build basic state visualization (rectangles with labels)
5. Implement basic transition visualization (arrows between states)
6. Create synchronization system between tabs using Zustand store
7. Add metadata serialization/deserialization

### Deliverables
- ✅ Tab-based interface with Code and Visual tabs
- ✅ Basic state machine diagram with states as boxes
- ✅ Simple transitions rendered as arrows
- ✅ Visual metadata stored in custom XML namespace
- ✅ Changes in code tab reflect in visual tab and vice versa
- ✅ Metadata preserved during round-trip editing

### Success Criteria
User can:
- Switch between Code and Visual tabs seamlessly
- See basic visual representation of their SCXML state machine
- Make changes in one tab and see updates in the other
- Save file with visual metadata preserved

### Dependencies & Libraries
```json
{
  "dependencies": {
    "d3": "^7.8.5",
    "@types/d3": "^7.4.3",
    "react-tabs": "^6.0.2"
  }
}
```

**Note:** Redux Toolkit removed as the project uses Zustand for state management, which is already installed and better suited for this use case.

---

## 🎯 MILESTONE 3: Rich State & Transition Visualization

**Duration:** Week 3  
**Goal:** Implement detailed visual differentiation for all SCXML elements

### Features to Implement

#### State Visualization Enhancements
- Entry/exit action highlighting with colored borders and icons
- Compound state containers with nested visualization
- Final state styling (double circles)
- Initial state indicators (arrow pointing in)
- Parallel state regions with clear boundaries

#### Transition Visualization Differentiation  
- **Condition + Event:** Solid blue lines with condition badges
- **Event-only:** Labeled solid gray lines with event text
- **Condition-only:** Dashed blue lines with condition display
- **Always transitions:** Dotted black lines (no condition/event)
- **Action-executing transitions:** Thicker lines with action indicators
- **Internal transitions:** Self-loop curves with action icons

### Technical Tasks
1. Enhance D3.js rendering engine for complex state types
2. Implement state classification system (simple, compound, final, parallel)
3. Create transition classification and styling system
4. Add icon library and state decoration system
5. Build compound state nesting visualization
6. Implement internal transition self-loop rendering
7. Create visual legend/key for different element types

### Deliverables
- ✅ Comprehensive visual language for all SCXML element types
- ✅ Interactive state machine diagrams with rich styling
- ✅ Clear visual distinction between different transition types
- ✅ Proper rendering of compound and parallel states
- ✅ Internal transitions shown as self-loops
- ✅ Visual legend explaining element types

### Success Criteria
User can:
- Immediately distinguish between different state and transition types
- Understand complex SCXML state machines at a glance
- See all SCXML semantics represented visually
- Navigate complex hierarchical state structures

### Dependencies & Libraries
```json
{
  "dependencies": {
    "d3-selection": "^3.0.0",
    "d3-shape": "^3.2.0",
    "d3-zoom": "^3.0.0",
    "react-icons": "^4.11.0"
  }
}
```

---

## 🎯 MILESTONE 4: Advanced UX & Theme Integration

**Duration:** Week 4  
**Goal:** Enhance user experience with navigation, theming, and interactivity

### Features to Implement

#### Text-Graph Linking & Navigation
- Click visual element → highlight corresponding XML in editor
- Click XML element → highlight visual representation
- Smooth scrolling and focus management between views
- Breadcrumb navigation for nested states

#### VS Code Theme Integration
- Detect and adapt to VS Code color schemes
- Theme adaptation system for diagram colors
- Customizable state colors for semantic meaning
- Dark/light mode toggle with smooth transitions

#### Interactive Diagram Controls
- Zoom and pan controls with smooth animations
- Minimap overview for large diagrams
- Fit-to-screen and zoom-to-selection functionality
- Mouse wheel zoom and drag-to-pan

#### Command Palette & Shortcuts
- Quick actions and element search using `cmdk`
- Keyboard shortcuts for common operations
- Context menus for diagram elements
- Undo/redo system across both views

#### Waypoint System
- Manual transition routing with drag-and-drop waypoints
- Visual waypoint handles and indicators
- Automatic waypoint generation to avoid overlaps
- Waypoint metadata storage in visual namespace

### Technical Tasks
1. Implement bidirectional element selection system
2. Build VS Code theme detection and adaptation
3. Add zoom/pan controls with D3.js zoom behavior
4. Integrate `cmdk` command palette
5. Create keyboard shortcut system with `react-hotkeys-hook`
6. Implement waypoint drag-and-drop with `react-dnd`
7. Build undo/redo system with state history

### Deliverables
- ✅ Seamless navigation between text and visual representations
- ✅ Professional theming matching VS Code appearance
- ✅ Interactive diagram with zoom/pan controls and minimap
- ✅ Command palette with search and quick actions
- ✅ Drag-and-drop waypoint editing system
- ✅ Comprehensive keyboard shortcuts

### Success Criteria
User can:
- Navigate effortlessly between code and visual views
- Use keyboard shortcuts for efficient editing
- Manipulate diagram layout with waypoints
- Work comfortably in their preferred VS Code theme
- Handle large state machines with smooth navigation

### Dependencies & Libraries
```json
{
  "dependencies": {
    "cmdk": "^0.2.0",
    "react-hotkeys-hook": "^4.4.1",
    "react-dnd": "^16.0.1",
    "monaco-themes": "^0.4.4",
    "chroma-js": "^2.4.2",
    "@types/chroma-js": "^2.4.3"
  }
}
```

---

## 🎯 MILESTONE 5: Inspector Palette & Production Polish

**Duration:** Week 5  
**Goal:** Complete the feature set with visual editing tools and production readiness

### Features to Implement

#### Inspector Palette System
- **Property Panel:** Edit selected state/transition properties visually
- **Action Editor:** Visual custom action namespace management
- **Style Panel:** Color picker and custom CSS class editor
- **Layout Tools:** Alignment, distribution, and spacing controls
- Context-aware editing based on current selection

#### Custom Action Authoring
- Visual namespace management with drag-and-drop
- Action definition panels with parameter editing
- Namespace import/export functionality
- Action library and template system

#### Production Features & Polish
- Comprehensive testing suite (unit + integration + E2E)
- Performance optimization for large diagrams (virtualization)
- Clean SCXML export with metadata removal option
- Accessibility improvements (ARIA labels, keyboard navigation)
- Error boundaries and graceful error handling
- Loading states and progress indicators
- Help system and keyboard shortcut reference

#### Documentation & Deployment
- Complete API documentation
- User guide and tutorials
- Deployment configuration for Vercel/Netlify
- CI/CD pipeline with GitHub Actions
- MIT license and contribution guidelines

### Technical Tasks
1. Build resizable inspector palette with `react-resizable-panels`
2. Create property editing forms with validation
3. Implement custom action namespace editor
4. Add comprehensive test coverage
5. Optimize rendering performance for large diagrams
6. Implement clean SCXML export functionality
7. Add accessibility features and ARIA labels
8. Set up deployment pipeline and documentation

### Deliverables
- ✅ Complete inspector palette for visual property editing
- ✅ Custom action authoring and namespace management
- ✅ Production-ready web application with full test coverage
- ✅ Clean SCXML export functionality
- ✅ Comprehensive documentation and help system
- ✅ MIT-licensed repository ready for public use

### Success Criteria
User can:
- Edit all SCXML properties visually without touching XML
- Create and manage custom action namespaces
- Export clean, W3C-compliant SCXML for production use
- Navigate the application entirely via keyboard
- Access comprehensive help and documentation

### Final Production Checklist
- [ ] All features from original VS Code plugin implemented
- [ ] Performance tested with large SCXML files (1000+ states)
- [ ] Accessibility audit passed
- [ ] Cross-browser compatibility verified
- [ ] Mobile/tablet responsive design
- [ ] Production deployment successful
- [ ] MIT license and repository documentation complete

### Dependencies & Libraries
```json
{
  "dependencies": {
    "react-resizable-panels": "^0.0.62",
    "react-color": "^2.19.3",
    "react-hook-form": "^7.48.2",
    "@hookform/resolvers": "^3.3.2",
    "zod": "^3.22.4"
  }
}
```

---

## Development Timeline

| Week | Milestone | Key Focus | Deliverable |
|------|-----------|-----------|-------------|
| 1 | Foundation | Project setup + SCXML parsing | Basic editor working |
| 2 | Architecture | Two-tab interface + metadata | Visual diagram sync |
| 3 | Visualization | Rich state/transition rendering | Complete visual language |
| 4 | UX Enhancement | Navigation + theming + controls | Professional UX |
| 5 | Production | Inspector + testing + deployment | Ready for public use |

## Risk Mitigation

**Technical Risks:**
- **Performance:** Implement virtualization for large diagrams
- **Browser Compatibility:** Use modern web standards with fallbacks
- **Complexity:** Maintain clear separation of concerns and modular architecture

**Scope Risks:**
- **Feature Creep:** Stick to defined milestones and defer non-essential features
- **Timeline:** Each milestone has buffer time for testing and refinement

## Success Metrics

**Functional Requirements:**
- [ ] All VS Code plugin features replicated
- [ ] Two-way editing with perfect synchronization
- [ ] Visual metadata system preserves SCXML compliance
- [ ] Professional UX matching VS Code quality

**Technical Requirements:**
- [ ] TypeScript with strict type checking
- [ ] >90% test coverage
- [ ] Performance: <100ms rendering for typical state machines
- [ ] Accessibility: WCAG 2.1 AA compliance

**Business Requirements:**
- [ ] MIT licensed open source repository
- [ ] Production-ready deployment
- [ ] Comprehensive documentation for contributors
- [ ] Ready for integration into larger applications