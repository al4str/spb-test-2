#!/bin/bash

# rm -rf ./dist/*
cp -f ./public/* ./dist/
./serveStatic.js
# don't fucking do this
# (npx parcel watch ./src/*.js -d ./dist/ -o stock-chart-widget.js &)
# (npx postcss ./src/*.css -o ./dist/stock-chart-widget.css -u autoprefixer -w --verbose &)
