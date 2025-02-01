# DialogJS Documentation

A lightweight JavaScript library for creating interactive dialogue systems in games.

## Table of Contents
1. [Overview](#overview)
2. [Core Features](#core-features)
3. [Getting Started](#getting-started)
    - [Installation](#installation)
    - [Basic Setup](#basic-setup)
4. [Story Formats](#story-formats)
    - [Text File Format](#text-file-format)
    - [Dictionary Format](#dictionary-format)
5. [Commands](#commands)
    - [Display Commands](#display-commands)
    - [Media Commands](#media-commands)
    - [Flow Control](#flow-control)
6. [Examples](#examples)
7. [API Reference](#api-reference)
8. [Troubleshooting](#troubleshooting)

## Overview
DialogJS is a JavaScript-based dialogue management system that enables developers to create rich, interactive narrative experiences. It supports text display, image handling, audio playback, and branching dialogue paths.

## Core Features
- Text-based dialogue management
- Image and background display
- Audio playback with fade effects
- Variable system for state management
- Branching dialogue paths
- Interactive button system
- Input handling system
- Character speaker system

## File Structure
- `dialog.js` - Main library file
- `resources/` - Directory for storing media assets
- Story files (`.txt` or JavaScript objects)

## Key Components

### Dialog Display
- Show/hide dialogue box
- Custom styling support
- Line break control
- Previous dialogue recall (using 'l' key)

### Media Management
- Background image control with fit options
- Image display with positioning
- Audio playback with fade effects
- Resource preloading support

### Interaction System
- Click/Space progression
- Button-based choices
- Text input handling
- Variable management
- Script navigation

### Customization
- Font family
- Color schemes
- Dialog box appearance
- Character speakers

## Version History
- v0.1: Basic audio and appearance customization
- v0.2: Variable system and interaction improvements
- v0.3: Script navigation and button system
- v0.4: Text input and history feature

## Future Development
- Effect system for image/audio manipulation
- Particle system for visual effects
- Inventory/backpack system

## Requirements
- Modern web browser
- JavaScript enabled
- Proper file structure with resources directory
# DialogJS (experimental)

## Table of Contents
- [Introduction](#introduction)
- [Setup](#setup)
- [Commands](#commands)
- [TODO](#todo)
- [Update](#update-log)
- [Contribute](#contribute)

## Introduction
**DialogJS** is a JavaScript-based library designed to create interactive dialogue systems for games. Inspired by the [Flower System](https://github.com/emptygamer/flower), DialogJS allows developers to manage dialogues, display images, and play audio seamlessly, enhancing the narrative experience in games.

## Setup
### Integration
**Integrating** [DialogJS](#introduction) into your website([example](https://kelvinlinkk.github.io/dialog/dialog.html)) is a relatively simple process. To begin, simply add the following HTML line to your project:
```html
    <script src="js/dialog.js">const dialogSystem = new DialogSystem();</script>
```
**Advice**: It is recommended to preload your resources (images and audio) to ensure a smooth experience. You can do this by adding the following lines in your HTML:
```html
    <link rel="preload" href="resources/image.png" as="image">
    <link rel="preload" href="resources/audio.mp3" as="audio">
```
For experienced developers, adjustments can be made to meet specific needs.

### Usage
You can create your interactive dialogue system using either:
1. Text Files (`.txt`)
    *  To create your interactive dialogue system, start by writing your script in a text file (like `story.txt` or `story2.txt`). 
    *  Remember, each non-command line in your story file represents a single paragraph in your game's narrative.
   * Command lines start with `[` and end with `]`.
2. JavaScript Dictionary Object

    * We also allow user to put their story in a dictionary, like this:
     ```javascript
         const story = {"name":["line1","line2"]}
     ```
 


The system supports story branching through the `[button]` and `[goto]` commands, allowing you to split your narrative across multiple files.It also contains the narrative of your game, including character dialogues, scene descriptions, and [commands](#commands) to control the visual and audio elements.Please use the commands listed below to enhance your story with features such as displaying [images](#image), playing [audio](#audio), and managing the dialogue box.

**Note**: To further enhance the narrative in `story.txt`, HTML elements can be incorporated. For font size adjustments, it is recommended to use the `em` unit, a relative font size measurement.

### File Management
Music and images should be stored in the `resources` folder for system access.

### Keys
Please press `l` to read previous dialog.

## Commands

**DialogJS** provides several commands to enhance your interactive dialogue system: use `[show]` to display the dialog box, `[hide]` to conceal it, and `[n]` to insert a line break. Change the background image with `[bg]`, where the first parameter is the image source and the second is the object-fit style. To display images, use `[img]`, and for audio playback, utilize `[audio]`, which allows for duration and fade-in/out effects.

### setting
> [ setting font-family color dialog-background-color dialog-background-img ]
* Customizes the font and the dialog box.

### display (show and hide)
> [ show ]
- Displays the dialog system.
> [ hide ]
- Hides the dialog system(not just the box).
### newline
> [ n ]
- Inserts a line break in the dialog.
### background
> [ bg source fit-style ]
- Changes the background image of the dialog system
- `source`: Path to the image file (relative to resources folder)
- `fit-style`: CSS object-fit value (cover, contain, fill, etc.)

Examples:
```markdown
[bg forest.jpg cover]
[bg castle.png contain]
```
### image
> [ img name src x y z width height show ]
- Displays an image with specified parameters.
### audio
>[ audio name src play time(s) fade(ms) ]
- Plays an audio file with options for duration and fade-in/out effects.

### Variables (setVar and showVar)
> [ setVar variable-name value ]
* Assigns a value to a variable.

> [ showVar variable-name ]
* Retrieves and displays the value of a variable.

> [ input variable-name text]
* displays an input box and provide with dirextion text.

### Script Flow(goto and button)
> [ goto filename ]
* This command is used to navigate to a different part of the script. The parameter `filename` should be the name of the file to navigate to.
> [ button text src ]
* This command allows user to create a button as a tool to read other scripts.
> [ showbutton ]
* Displays all buttons and clears them afterward, allowing users to select options by clicking or using the keyboard (scrolling with W/S or Up/Down keys, and confirming with Enter/Space).

### Characters
>[ speaker isvariable name ]
* Use the command to assign the speaker of the texts.

## Update log
### v0.1
- Mute the audio when [ hide ]
- Add command [ setting ] to personalize the appearance
### v0.2
- Introduce [ setVar ] and [ showVar ] for variable customization.
- Enable user interaction through click and space key for dialog progression.
- Exclude lines containing only commands from being considered as lines.
### v0.3
- Incorporate the [ goto ] command and [ button ] commands for script navigation.
### v0.4
- Add text input to increase players' gaming experience.
- Add 'l' key to read previous texts.
- Allows local accessment by js dictionary.


## TODO
### New Commands
- [ effect ] : This command enables users to manipulate images or modify audio files.

- [ particle ] : This command can be used to create effects such as wind, rain, shooting stars, or other visual elements.

### functions
- **backpack**: filled with an array of objects. 

## Contribute

We're always open to feedback, bug reports, and contributions. If you've found an issue or have an idea for making DialogJS better, go ahead and submit a pull request. Your help is super important in making DialogJS more awesome!