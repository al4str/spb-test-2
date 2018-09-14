#!/usr/bin/env node

const path = require('path');
const express = require('express');

const port = process.env.PORT || 5000;
const server = express();
server.use(express.static('dist', { index: false }));
server.use((req, res) => {
  const indexFilePath = path.join(process.cwd(), 'dist', req.path, 'index.html');
  res.sendFile(indexFilePath);
});
server.listen(port, () => console.info(`localhost:${port}`));
