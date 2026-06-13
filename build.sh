#!/bin/bash
# Automates the installation and build process.

echo "Installing project dependencies..."
npm install

echo "Compiling the application for production..."
npm run build

echo "Build process completed successfully!"
