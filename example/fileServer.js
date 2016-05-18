#!/usr/bin/env node

/**
 * Copyright (c) 2016 Fabio Massaioli and other contributors
 *
 * Code from Node http module:
 *   Copyright Joyent, Inc. and other Node contributors
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

'use strict';

var fcgi = require('../index.js'),
    fs = require('fs'),
    util = require('util');

var count = 0;

function s(obj) {
    return util.inspect(obj);
}

fcgi.createServer(function (req, res) {
    count += 1;

    req.on('complete', function () {
        var path = req.url.slice(1);
        fs.stat(path, function (err, stat) {
            if (err) {
                res.writeHead(500, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Content-Length': err.stack.length
                });
                res.end(err.stack + '\n');
            } else {
                var stream = fs.createReadStream(path);
                res.writeHead(200, {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': stat.size
                });
                stream.pipe(res);
            }
        });
    });
}).listen();

process.on('uncaughtException', function (err) {
    fs.appendFileSync('test.log', err.stack + '\n\n');
    process.exit(1);
});

process.on('exit', function () {
    fs.appendFileSync('test.log', 'Exit - Uptime:' + process.uptime() + '\n\n');
});

process.on('SIGTERM', function () {
    fs.appendFileSync('test.log', 'SIGTERM\n');
    process.exit(0);
});

process.on('SIGINT', function () {
    fs.appendFileSync('test.log', 'SIGINT\n');
    process.exit(0);
});

process.on('SIGUSR1', function () {
    fs.appendFileSync('test.log', 'SIGUSR1\n');
});
