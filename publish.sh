#!/bin/bash

rm -rf ./docs/*
cp ./public/* ./docs/
npx parcel build ./src/*.js -d ./docs/ -o stock-chart-widget.min.js --experimental-scope-hoisting --no-source-maps
npx postcss ./src/*.css -o ./docs/stock-chart-widget.min.css -u autoprefixer -u cssnano --verbose --no-map --env production
