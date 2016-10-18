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

'use strict';

var fs = require('fs'),
    http = require('http');

var server = require('./lib/server.js'),
    response = require('./lib/response.js');

exports.Server = server.Server;

// NOTE: http module compatibility
exports.IncomingMessage = http.IncomingMessage;
exports.OutgoingMessage = http.OutgoingMessage;
exports.ServerResponse = response.ServerResponse;
exports.AuthorizerResponse = response.AuthorizerResponse;

/**
 * function createServer([responder], [authorizer], [filter], [config])
 * Creates and returns a FastCGI server object. Compatible with http.createServer
 *
 * Arguments:
 *   - responder (optional): callback for FastCGI responder requests (normal HTTP requests, 'request' event)
 *   - authorizer (optional): callback for FastCGI authorizer requests ('authorize' event)
 *   - filter (optional): callback for FastCGI filter requests ('filter' event)
 *   - config (optional): server configuration (default: { maxConns: 2000, maxReqs: 2000, multiplex: true, valueMap: {} })
 */

exports.createServer = function (responder, authorizer, filter, config) {
    return new server.Server(responder, authorizer, filter, config);
};

if (process.platform === "win32") {
    exports.isService = function () {
        return false; // On windows we need to call GetStdHandle(-10)
                      // from kernel32.dll
    }
} else {
    exports.isService = function () {
        return fs.fstatSync(process.stdin.fd).isSocket();
    }
}
