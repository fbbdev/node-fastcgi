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

var fcgi = require('fastcgi-stream'),
    http = require('http'),
    util = require('util'),
    streams = require('./streams.js'),
    response = require('./response.js');

var InputStream = streams.InputStream,
    OutputStream = streams.OutputStream,
    IOStream = streams.IOStream;

var Response = response.Response,
    AuthorizerResponse = response.AuthorizerResponse;

exports.Request = Request;

/**
 * function Request(conn, id, role, keepalive)
 * Represents a FastCGI request. Emulates net.Socket API.
 */

function Request(conn, id, role, keepalive) {
    IOStream.call(this, conn, id);

    this._role = role;
    this._keepAlive = keepalive;

    this._stdinComplete = false;
    this._dataComplete = false;

    this._req = null;
    this._res = null;

    this.params = {};
    this.dataStream = new InputStream(); // NOTE: data stream for filter requests
    this.errorStream = new OutputStream(conn, id, fcgi.records.StdErr);

    this.on('drain', function () {
        if (this._res) {
            this._res.emit('drain');
        }
    });

    this.once('finish', function () {
        if (this._res) {
            this._res.detachSocket(this);
            this._res = null;
        }

        this.destroy();
    });

    this.on('close', this.errorStream.destroy.bind(this.errorStream, null));
}
util.inherits(Request, IOStream);

Request.prototype._param = function (name, value) {
    this.params[name] = value;
};

var HEADER_EXPR = /^HTTP_/;
var UNDERSCORE_EXPR = /_/g;

function makeUrl(params) {
    if (params.REQUEST_URI && params.REQUEST_URI.length) {
        return params.REQUEST_URI;
    } else {
        var url = '';

        if (params.SCRIPT_NAME) {
            url += params.SCRIPT_NAME;
        }

        if (params.PATH_INFO) {
            url += params.PATH_INFO;
        }

        if (params.QUERY_STRING) {
            url += '?' + params.QUERY_STRING;
        }

        return url;
    }
}

Request.prototype._createReqRes = function () {
    this._req = new http.IncomingMessage(this);

    if (this.params.SERVER_PROTOCOL) {
        this._req.httpVersion = this.params.SERVER_PROTOCOL.slice(5);
        var numbers = this._req.httpVersion.split('.');
        this._req.httpVersionMajor = parseInt(numbers[0]);
        this._req.httpVersionMinor = parseInt(numbers[1]);
    }

    this._req.url = makeUrl(this.params);

    var raw = this._req.rawHeaders,
        dest = this._req.headers;

    for (var param in this.params) {
        if (HEADER_EXPR.test(param) || param === 'CONTENT_LENGTH' || param === 'CONTENT_TYPE') {
            var name = param.replace(HEADER_EXPR, '').replace(UNDERSCORE_EXPR, '-');

            // Ignore HTTP_CONTENT_TYPE and HTTP_CONTENT_LENGTH
            if (HEADER_EXPR.test(param) && (name.toLowerCase() === 'content-type' || name.toLowerCase() === 'content-length'))
                continue;

            var value = this.params[param];
            raw.push(name, value);
            this._req._addHeaderLine(name, value, dest);
        }
    }

    this._req.method = this.params.REQUEST_METHOD || 'GET';

    this._req.complete = this._stdinComplete && this._dataComplete;

    this.pause();

    this.on('data', function (data) {
        if (this._req) {
            if (!this._req.push(data)) {
                this.pause();
            }
        }
    });

    this.on('end', function () {
        if (this._req) {
            this._req.push(null);
        }
    });

    if (this._role === fcgi.records.BeginRequest.roles.AUTHORIZER) {
        this._res = new AuthorizerResponse(this._req);
    } else {
        this._res = new Response(this._req);
    }

    this._res.shouldKeepAlive = this.params.HTTP_CONNECTION === 'keep-alive';
    this._res.assignSocket(this);

    var self = this;
    this._res.on('finish', function () {
        self.end();
    });

    // NOTE: Backward compatibility
    this._req.data = this.dataStream;
    this._req.cgiParams = this.params;

    this._res.stdout = this;
    this._res.stderr = this.errorStream;

    if (this._req.complete) {
        process.nextTick(this._req.emit.bind(this._req, 'complete'));
    }

    return { req: this._req, res: this._res };
}

Request.prototype._abort = function (err) {
    if (this._req) {
        this._req.emit('aborted')
    }

    this.destroy(err);
};

// net.Socket API emulation
Object.defineProperties(Request.prototype, {
    "bufferSize": {
        get: function () {
            return this._conn.bufferSize;
        }
    },

    "bytesRead": {
        get: function () {
            return this._conn.bytesRead;
        }
    },

    "bytesWritten": {
        get: function () {
            return this._conn.bytesWritten
        }
    },

    "localAddress": {
        get: function () {
            return this.params.SERVER_ADDR || '::';
        }
    },

    "localPort": {
        get: function () {
            return parseInt(this.params.SERVER_PORT) || 0;
        }
    },

    "remoteAddress": {
        get: function () {
            return this.params.REMOTE_ADDR || '::';
        }
    },

    "remoteFamily": {
        get: function() {
            return this.remoteAddress.indexOf('.') !== -1 ? 'IPv4' : 'IPv6';
        }
    },

    "remotePort": {
        get: function () {
            return parseInt(this.params.REMOTE_PORT) || 0;
        }
    }
});

Request.prototype.address = function () {
    return {
        address: this.localAddress,
        family: this.localAddress.indexOf('.') !== -1 ? 'IPv4' : 'IPv6',
        port: this.localPort
    };
};

Request.prototype._destroy = function (err, callback) {
    var self = this;
    IOStream.prototype._destroy.call(this, err, function () {
        self._conn.endRequest(self._id, err ? 1 : 0, undefined, function () {
            callback(err);
        });
    });
}

Request.prototype.ref = function () {
    return this._conn.ref();
}

Request.prototype.unref = function () {
    return this._conn.unref();
}

Request.prototype.setKeepAlive = function () {
    return this._conn.setKeepAlive.apply(this._conn, arguments);
}

Request.prototype.setNoDelay = function () {
    return this._conn.setNoDelay.apply(this._conn, arguments);
}

Request.prototype.setTimeout = function (msecs, callback) {
    if (callback)
        this.once('timeout', callback);

    return this._conn.setTimeout(msecs);
};
