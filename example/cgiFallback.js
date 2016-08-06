#!/usr/bin/env node

/**
 * Copyright (c) 2016 Fabio Massaioli and other contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// To run this example:
// > npm install puffnfresh/node-cgi
// > ./cgiFallback.js 2> /dev/null

'use strict';

var fcgi = require('../index.js'),
    cgi  = require('node-cgi'),
    fs   = require('fs');

function log(msg) {
    fs.appendFileSync('cgiFallback.log', msg);
}

var createServer = fcgi.createServer;

// stat fd 0; if it's not a socket switch to plain CGI.
if (!(fs.fstatSync(0).mode & fs.constants.S_IFSOCK))
    createServer = cgi.createServer;

createServer(function (req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/plain',
    });
    res.end("It's working!\n");
}).listen(function () {
    log('Listening\n');
});

process.on('uncaughtException', function (err) {
    log(err.stack + '\n\n');
    process.exit(1);
});

process.on('exit', function () {
    log('Exit - Uptime:' + process.uptime() + '\n\n');
});

process.on('SIGTERM', function () {
    log('SIGTERM\n');
    process.exit(0);
});

process.on('SIGINT', function () {
    log('SIGINT\n');
    process.exit(0);
});

process.on('SIGUSR1', function () {
    log('SIGUSR1\n');
});
