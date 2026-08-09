# Building PlayBound Launcher

This document describes how to compile the PlayBound launcher for Windows, macOS, and Linux.

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

CI: `.github/workflows/build-macos.yml` builds and uploads on pushes that touch `launcher/**`.

### Code Signing & Notarization
To sign and notarize the macOS build, you need to set the following environment variables before building:
- `APPLE_ID`: Your Apple ID email (e.g., `developer@playbound.gg`)
- `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password generated in appleid.apple.com
- `APPLE_TEAM_ID`: Your Apple Developer Team ID
- `CSC_LINK` (Optional): Path or base64 of your code signing certificate
- `CSC_KEY_PASSWORD` (Optional): Password for your code signing certificate

When these are set, `electron-builder` will automatically attempt to code sign and notarize the application. Notarization is required for users to launch the application without seeing a gatekeeper warning.

## Linux

### Prerequisites
- Node.js on a Linux machine (or GitHub Actions `ubuntu-latest`)
- `npm install` inside the `launcher/` directory

### Compiling
To build the Linux AppImage (x64):
```bash
npm run dist:linux
```
This produces `PlayBound-Linux-<version>.AppImage` in the `dist/` directory.

Upload:
```bash
cd ../platform
npm run upload:launcher -- --linux --promote-prod
```

CI: `.github/workflows/build-linux.yml` builds the AppImage and uploads to Vercel Blob (admin + production aliases) whenever `launcher/**` changes on `main`.

### Running the AppImage
```bash
chmod +x PlayBound-Linux-*.AppImage
./PlayBound-Linux-*.AppImage
```

## Architecture

The launcher uses a capability-based architecture in `launcher/platform` (`windows.js`, `macos.js`, `linux.js`). Prefer platform modules over sprinkling `process.platform` checks throughout the codebase.
