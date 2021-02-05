#!/bin/zsh
rm -rf dist/
npx tsc --declaration
npm publish