# SCXML Visual Editor

A powerful web-based editor for SCXML (State Chart XML) files with real-time validation, visual diagram editing, and two-way synchronization between code and visual representations.

## Table of Contents

- [What is SCXML Visual Editor?](#what-is-scxml-visual-editor)
- [Key Features](#key-features)
- [Getting Started](#getting-started)
- [How to Use](#how-to-use)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Tips & Tricks](#tips--tricks)
- [Troubleshooting](#troubleshooting)

## What is SCXML Visual Editor?

SCXML Visual Editor helps you create and edit state machine diagrams without needing to write complex XML code by hand. Think of it as a tool that lets you design state machines visually while automatically handling the technical XML format behind the scenes.

**What you can do:**

- 📝 Edit SCXML files with a user-friendly code editor
- 🎨 Create and edit state diagrams visually with drag-and-drop
- 🔄 Switch between code and visual views - changes sync automatically
- ✅ Get instant feedback on errors and warnings
- ⏮️ Undo and redo any changes easily
- 💾 Save your work with or without visual information

## Key Features

### Dual Editing Modes

**Code Editor**

- Syntax highlighting makes code easy to read
- Smart autocomplete suggests what you can type next
- Real-time error checking as you type
- Click on errors to jump to the problem location

**Visual Diagram**

- Drag and drop states to position them
- Double-click states to rename them
- Draw transitions by dragging between states

### Two-Way Synchronization

Change something in the code, and the diagram updates automatically. Move something in the diagram, and the code updates. You choose how you want to work.

### Hierarchical Navigation

Complex state machines with nested states? No problem! The editor shows one level at a time so you don't get overwhelmed:

- Start at the top level to see your main states
- Click on a state to "enter" it and see what's inside
- Choose the state from the breadcrumb to go back to the parent level
- Breadcrumbs show you where you are

### Undo/Redo

Made a mistake? Press Ctrl+Z to undo. Changed your mind about undoing? Press Ctrl+Y to redo. It's that simple.

## Getting Started

### Installation

1. **Install Node.js** (if you haven't already)

   - Download from [nodejs.org](https://nodejs.org)
   - Version 20 or higher is required

2. **Open a terminal/command prompt** and navigate to the project folder:

   ```bash
   cd scxml-parser
   ```

3. **Install the application**:

   ```bash
   npm install
   ```

4. **Start the application**:

   ```bash
   npm run dev
   ```

5. **Open your browser** and go to:
   ```
   http://localhost:3000
   ```

### First Steps

When you first open the application, you'll see two options:

**Option 1: Create a new document** (Recommended for first-time users)

- Click "create a new one"
- You'll start with a basic template you can customize
- This is the best way to learn how the editor works

**Option 2: Upload an existing SCXML file**

- Click "Upload SCXML File" or drag and drop your file
- The file will open in both the code editor and visual diagram
- Use this if you already have an SCXML file to edit

## How to Use

### Working with the Visual Diagram

#### Understanding What You See

- **Solid border states** = Simple states (don't contain other states)
- **Dashed border states** = Compound states (contain child states inside)
- **Small circles on state borders** = Connection points for transitions
- **Arrows between states** = Transitions (how states connect)

#### Creating a New State

1. Click the **"New State" button** (shows "S") in the toolbar
2. A new state appears in the diagram
3. Double-click the state to give it a meaningful name
4. Press Enter to save the name

#### Renaming a State

1. Double-click any state
2. Type the new name
3. Press Enter to save (or Esc to cancel)
4. All transitions that reference this state update automatically!

#### Moving States

**Single state:**

- Click and drag the state to where you want it

**Multiple states:**

- Hold Ctrl (Windows/Linux) or Cmd (Mac) while clicking states
- Or drag a box around multiple states to select them
- Drag any selected state to move them all together

#### Deleting States

1. Click the state to select it (or select multiple states)
2. Press Delete or Backspace key
3. The state is removed immediately
4. Use Undo (Ctrl+Z) if you deleted by mistake

#### Creating Transitions (Arrows)

1. Find a small circle on the edge of your starting state
2. Click and drag from that circle
3. Drop onto a circle on your target state
4. A transition (arrow) is created automatically

#### Navigating Into Compound States

If a state has a dashed border, it means it contains child states:

1. Look for the down arrow (↓) icon that appears when you hover over it
2. Click the down arrow to "enter" that state
3. You'll now see only the child states inside
4. Use the "Up" button (↑) in the toolbar to go back

### Working with the Code Editor

#### Editing Code

- Click in the editor and type normally
- The visual diagram updates automatically as you type
- Red squiggly lines indicate errors
- Yellow squiggly lines indicate warnings

#### Using Autocomplete

1. Start typing `<` or press Ctrl+Space and you'll see available SCXML elements
2. Use arrow keys to navigate suggestions
3. Press Enter to accept a suggestion
4. When typing state names in transitions, press Ctrl+Space to see all available states

#### Finding Errors

- Look at the top-right corner for the validation button
- **Green = "Valid"** means no errors
- **Yellow = "X warnings"** means there are suggestions
- **Red = "X errors"** means something needs to be fixed

To see error details:

1. Click the validation button
2. An error panel opens on the right
3. Click any error to jump to that line in the code

#### Folding Code

To collapse sections of code for better overview:

- Click the small arrow (▼) next to line numbers to fold/unfold
- Useful when working with large state machines

### Importing Files

**Supported file types:** `.scxml` or `.xml` files containing SCXML

**Maximum file size:** 10MB

**Three ways to import:**

1. Drag and drop a file onto the upload area (when starting)
2. Click "Upload SCXML File" and browse for your file
3. Click "Load New File" button in the toolbar (when already editing)

### Exporting Files

Click the **"Export"** button in the toolbar and choose:

**"With Visual Metadata"** (Recommended)

- Saves state positions and diagram layout
- Use this if you plan to edit the file again later
- When you re-open the file, everything will be where you left it

**"Without Visual Metadata"** (Clean)

- Saves pure SCXML without visual information
- Use this for production or sharing with other tools
- Creates a smaller, cleaner file

### Using Undo/Redo

**Keyboard shortcuts:**

- Undo: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
- Redo: Ctrl+Y (Windows/Linux) or Cmd+Y (Mac)

**Visual buttons:**

- Click the undo/redo buttons (⟲ ⟳) in the toolbar

**How it works:**

- Every change you make can be undone
- Text changes are grouped together (if you type quickly)
- Visual changes (moving, deleting) create individual undo points
- The history is maintained throughout your session

## Keyboard Shortcuts

### Essential Shortcuts

| What You Want to Do      | Windows/Linux     | Mac               |
| ------------------------ | ----------------- | ----------------- |
| Undo                     | Ctrl+Z            | Cmd+Z             |
| Redo                     | Ctrl+Y            | Cmd+Y             |
| Delete selected state(s) | Delete            | Delete            |
| Select multiple states   | Ctrl+Click        | Cmd+Click         |
| Find in code             | Ctrl+F            | Cmd+F             |
| Autocomplete             | Ctrl+Space        | Cmd+Space         |
| Save/Export              | Use Export button | Use Export button |

### Code Editor Shortcuts

| Action            | Windows/Linux | Mac         |
| ----------------- | ------------- | ----------- |
| Find and replace  | Ctrl+H        | Cmd+H       |
| Comment/uncomment | Ctrl+/        | Cmd+/       |
| Fold section      | Ctrl+Shift+[  | Cmd+Shift+[ |
| Unfold section    | Ctrl+Shift+]  | Cmd+Shift+] |

## Tips & Tricks

### For Beginners

1. **Start with a new document** - Click "create a new one" to see a basic template
2. **Begin with the visual diagram** - It's easier to understand your state machine visually
3. **Don't worry about mistakes** - You can always undo
4. **Save frequently** - Use the Export button to save your work regularly

### For Efficient Editing

1. **Use hierarchy navigation** - For complex state machines, work on one level at a time
2. **Multi-select for batch operations** - Move or delete multiple states at once
3. **Let autocomplete help you** - Press Ctrl+Space when you're not sure what to type
4. **Keep the error panel visible** - Click the validation button to see errors as you work
5. **Export with metadata** - When saving work-in-progress files, always include visual metadata

### Understanding State Types

- **Initial State** - Where your state machine starts
- **Simple State** - A regular state that doesn't contain other states
- **Compound State** - Contains child states inside it

## Troubleshooting

### Common Issues

**Problem: Changes in the visual diagram don't appear in the code**

- Solution: Wait a moment - updates happen automatically but with a small delay

**Problem: I can't see all my states in the visual diagram**

- Solution: You might be inside a compound state. Click the "Up" button (↑) to go to the parent level

**Problem: File upload fails**

- Check: Is your file larger than 10MB? Try a smaller file
- Check: Is the file extension .scxml or .xml? Other formats aren't supported
- Check: Is the SCXML format valid? Try opening it in a text editor first

**Problem: The diagram looks messy**

- Solution: States overlap or are poorly positioned? Manually drag them to better positions
- Tip: Work on one hierarchy level at a time for cleaner layouts

**Problem: I deleted something by accident**

- Solution: Press Ctrl+Z immediately to undo the deletion

**Problem: Autocomplete isn't working**

- Solution: Try pressing Ctrl+Space to manually trigger it
- Make sure you're in a location where autocomplete makes sense (like inside a tag)

### Browser Compatibility

This application works best in modern browsers:

- ✅ Google Chrome (recommended)
- ✅ Microsoft Edge
- ✅ Mozilla Firefox
- ✅ Safari
- ✅ Opera

### Getting Help

- **Start simple**: Create a new document to see a basic template and build from there
- **Error messages**: Read them carefully - they usually explain what's wrong
- **Validation button**: Click it to see detailed error information

---

**Need more help?** Open an issue on GitHub or check the project documentation.

**Enjoying the editor?** Consider contributing or sharing it with others!
