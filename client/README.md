# BrokenCrystals React Client

A React application designed to showcase a marketplace with various features including authentication, testimonials, user management and so on.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)

## Prerequisites

This project requires Node.js version 18 or higher and npm version 10 or higher. Ensure you have the correct versions installed by running:

```bash
node -v
npm -v
```

## Getting Started

To get a local copy up and running, follow these steps:

1. Clone the repo:
   ```bash
   git clone https://github.com/BrightSec/brokencrystals
   ```
2. Navigate to the project directory:
   ```bash
   cd brokencrystals
   ```
3. Install the dependencies:
   ```bash
   npm ci --prefix client
   ```
4. Run the server application (see this repository main [README](../README.md)).
5. Run the client application in development mode:
   ```bash
   npm run start --prefix client
   ```

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in development mode. Open [http://localhost:3001](http://localhost:3001) to view it in the browser.

### `npm run build`

Builds the app for production to the `dist` folder. It correctly bundles React in production mode and optimizes the build for the best performance.

### `npm run serve`

Serves the built app for preview.

### `npm run test:e2e:gui`

Opens Cypress for end-to-end testing in GUI mode.

### `npm run test:e2e:ci`

Runs Cypress for end-to-end testing in CI mode.

### `npm run test`

Alias for `npm run test:e2e:ci`

### `npm run format`

Checks the code formatting using Prettier.

### `npm run lint`

Runs ESLint to check for code quality issues.
