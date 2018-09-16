#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const util = require('util');
const express = require('express');

const port = process.env.PORT || 5000;
const server = express();
const readFile = util.promisify(fs.readFile);
server.use(express.static('dist', { index: false }));
server.get('/', async (req, res) => {
  const indexFilePath = path.join(process.cwd(), 'dist', 'index.html');
  let indexFile = await readFile(indexFilePath, 'utf-8');
  indexFile = indexFile.replace(/\.min\.(js|css)/gi, '.$1');
  res.send(indexFile);
});
server.listen(port, () => console.info(`localhost:${port}`));
