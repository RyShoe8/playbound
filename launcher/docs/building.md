# Building PlayBound Launcher

This document describes how to compile the PlayBound launcher for Windows and macOS.

## Windows

### Prerequisites
- Node.js
- `npm install` inside the `launcher/` directory

### Compiling
To build the Windows executable:
```bash
npm run dist:dev # Unsigned build for testing
npm run dist:prod # Signed production build
```
This produces `PlayBound-Setup-<version>.exe` in the `dist/` directory.

## macOS

### Prerequisites
- Node.js on a macOS machine
- `npm install` inside the `launcher/` directory

### Compiling
To build the macOS universal binary (Apple Silicon + Intel):
```bash
npm run dist:mac
```
This produces a DMG file in the `dist/` directory.

### Code Signing & Notarization
To sign and notarize the macOS build, you need to set the following environment variables before building:
- `APPLE_ID`: Your Apple ID email (e.g., `developer@playbound.gg`)
- `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password generated in appleid.apple.com
- `APPLE_TEAM_ID`: Your Apple Developer Team ID
- `CSC_LINK` (Optional): Path or base64 of your code signing certificate
- `CSC_KEY_PASSWORD` (Optional): Password for your code signing certificate

When these are set, `electron-builder` will automatically attempt to code sign and notarize the application. Notarization is required for users to launch the application without seeing a gatekeeper warning.

## Architecture

The launcher uses a capability-based architecture in `launcher/platform`. When adding new OS support (e.g., Linux), implement a new module that fulfills the `Platform` interface and expose it in `platform/index.js`. Do not sprinkle `process.platform` checks throughout the codebase.
