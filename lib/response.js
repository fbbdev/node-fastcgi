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

var http = require('http'),
    util = require('util');

exports.Response = Response;
exports.AuthorizerResponse = AuthorizerResponse;

/**
 * function Response(req)
 * FastCGI response. Inherits http.ServerResponse
 */

function Response(req) {
    if (!(this instanceof Response)) {
        return new Response(req);
    }

    this._storeHeader = function (statusLine, headers) {
        if (!this.getHeader('transfer-encoding')) {
            // This is required to prevent nodejs using chunked-encoding
            // when no content-length header is present
            this.removeHeader('transfer-encoding');
        }

        return http.ServerResponse.prototype._storeHeader.call(
            this, statusLine.replace('HTTP/1.1', 'Status:'), headers);
    };

    this.writeContinue = function (cb) {
        this._writeRaw('Status: 100 Continue' + CRLF + CRLF, 'ascii', cb);
        this._sent100 = true;
    };

    http.ServerResponse.call(this, req);
}
util.inherits(Response, http.ServerResponse);

/**
 * function AuthorizerResponse(req)
 * FastCGI authorizer response. Inherits Response
 * This object has three special methods:
 *   - function setVariable(name, value): translates to setHeader('Variable-' + name, value)
 *   - function allow(): calls end() with status code 200 and no body
 *   - function deny(): calls end() with status code 403 and no body
 */

function AuthorizerResponse(req) {
    if (!(this instanceof AuthorizerResponse)) {
        return new AuthorizerResponse(req);
    }

    Response.call(this, req);

    this.setHeader('Content-type', 'text/plain');
}
util.inherits(AuthorizerResponse, Response);

AuthorizerResponse.prototype.setVariable = function (name, value) {
    this.setHeader('Variable-' + name, value);
};

AuthorizerResponse.prototype.allow = function () {
    this.statusCode = 200;
    this.end();
};

AuthorizerResponse.prototype.deny = function () {
    this.statusCode = 403;
    this.end();
};
