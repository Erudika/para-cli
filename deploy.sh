#!/bin/bash

echo "Last tag was:" $(git describe --tags --abbrev=0)
git add -A && git commit -m "prepare release"
npm run release