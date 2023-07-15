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

var net = require('net'),
    util = require('util'),
    fcgi = require('fastcgi-stream'),
    Request = require('./request.js').Request;

exports.Server = Server;

var VALUE_MAP = {
    'FCGI_MAX_CONNS': 'maxConns',
    'FCGI_MAX_REQS': 'maxReqs',
    'FCGI_MPXS_CONNS': 'multiplex'
};

function isFunction(obj) {
    return typeof obj === 'function';
}

/**
 * function Server([responder], [authorizer], [filter], [config])
 * FastCGI server object. Compatible with http.Server
 *
 * Arguments:
 *   - responder (optional): callback for FastCGI responder requests (normal HTTP requests, 'request' event)
 *   - authorizer (optional): callback for FastCGI authorizer requests ('authorize' event)
 *   - filter (optional): callback for FastCGI filter requests ('filter' event)
 *   - config (optional): server configuration (default: { maxConns: 2000, maxReqs: 2000, multiplex: true, valueMap: {} })
 */

function Server(responder, authorizer, filter, config) {
    if (!(this instanceof Server)) {
        return new Server(responder, authorizer, filter, config);
    }

    net.Server.call(this, { allowHalfOpen: false });

    config = config ||
        (isFunction(filter) ? {} : filter ||
            (isFunction(authorizer) ? {} : authorizer ||
                (isFunction(responder) ? {} : responder || {})));

    config.maxConns = parseInt(config.maxConns) || 2000;
    config.maxReqs = parseInt(config.maxReqs) || 2000;

    if (config.multiplex === undefined) {
        config.multiplex = true;
    } else {
        config.multiplex = config.multiplex ? true : false;
    }

    config.valueMap = config.valueMap || {};
    for (var v in VALUE_MAP) {
        config.valueMap[v] = VALUE_MAP[v];
    }

    this.config = config;
    this.maxHeadersCount = 0;
    this.timeout = 2 * 60 * 1000;

    if (isFunction(responder)) {
        this.on('request', responder);
    }

    if (isFunction(authorizer)) {
        this.on('authorize', authorizer);
    }

    if (isFunction(filter)) {
        this.on('filter', filter);
    }

    this.on('connection', connectionListener);
}
util.inherits(Server, net.Server);

/**
 * server.listen = function([options...], [callback])
 * Starts listening on default FastCGI socket.
 * Forwards to net.Server.listen if called with options.
 *
 * Arguments:
 *   - options (optional): net.Server.listen options
 *   - callback (optional): this parameter will be added as a listener
 *                          for the 'listening' event.
 */

Server.prototype.listen = function (callback) {
    if (arguments.length > 0 && !isFunction(callback)) {
        return net.Server.prototype.listen.apply(this, arguments);
    }

    return net.Server.prototype.listen.call(this, process.stdin, callback);
};

Server.prototype.setTimeout = function (msecs, callback) {
    this.timeout = msecs;

    if (callback) {
        this.on('timeout', callback);
    }
};

function connectionListener(socket) {
    var stream = new fcgi.FastCGIStream(socket),
        requests = {};

    function endRequest(id, status, reason, callback) {
        if (reason === undefined) {
            reason = fcgi.records.EndRequest.protocolStatus.REQUEST_COMPLETE;
        }

        if (socket.writable && !socket.destroyed) {
            var closeConn = (id in requests && !requests[id]._keepAlive);
            delete requests[id];

            stream.writeRecord(
                id, new fcgi.records.EndRequest(status, reason),
                function (err) {
                    if (closeConn && !socket.destroyed) {
                        socket.end();
                    }

                    if (callback)
                        callback(err);
                });
        }

        delete requests[id];
    }

    function abortAll(hadError) {
        for (var id in requests) {
            requests[id]._abort(hadError);
        }
    }

    socket.stream = stream;
    socket.endRequest = endRequest;

    var self = this;

    if (this.timeout) {
        socket.setTimeout(this.timeout);
    }

    socket.on('timeout', function () {
        var reqSocketTimeout = false, reqTimeout = false,
            resTimeout = false, serverTimeout = false;

        for (var id in requests) {
            var request = requests[id];
            reqSocketTimeout = reqSocketTimeout || request.emit('timeout', socket);
            reqTimeout = reqTimeout || (request._req && request._req.emit('timeout', request));
            resTimeout = resTimeout || (request._res && request._res.emit('timeout', request));
        }

        serverTimeout = self.emit('timeout', socket);

        if (!reqSocketTimeout && !reqTimeout && !resTimeout && !serverTimeout) {
            socket.destroy();
        }
    });

    socket.once('error', function (err) {
        socket.on('error', function () {});

        if (!self.emit('clientError', err, socket)) {
            socket.destroy();
        }
    });

    socket.on('close', abortAll);

    stream.on('record', function (id, record) {
        if (record.TYPE == fcgi.records.GetValues.TYPE) {
            var result = [];

            record.values.forEach(function (v) {
                if (v === 'FCGI_MPXS_CONNS') {
                    result.push([v, self.config.multiplex ? "1" : "0"]);
                } else if (v in self.config.valueMap) {
                    result.push([v, self.config[self.config.valueMap[v]].toString()]);
                }
            });

            stream.writeRecord(id, new fcgi.records.GetValuesResult(result));
        } else if (record.TYPE == fcgi.records.BeginRequest.TYPE) {
            if (id in requests) {
                // Request id already in use
                self.emit('protocolError', new Error("Request id " + id + " already in use"));
                return;
            }

            if (!self.config.multiplex && requests.length > 0) {
                endRequest(id, 1, fcgi.records.EndRequest.protocolStatus.CANT_MPX_CONN);
                return;
            }

            var keepAlive = record.flags & fcgi.records.BeginRequest.flags.KEEP_CONN;

            switch (record.role) {
            case fcgi.records.BeginRequest.roles.RESPONDER:
                if (self.listeners('request').length < 1) {
                    endRequest(id, 1, fcgi.records.EndRequest.protocolStatus.UNKNOWN_ROLE, function () {
                        if (!keepAlive && !socket.destroyed) {
                            socket.end();
                        }
                    });

                    return;
                }
                break;

            case fcgi.records.BeginRequest.roles.AUTHORIZER:
                if (self.listeners('authorize').length < 1) {
                    endRequest(id, 1, fcgi.records.EndRequest.protocolStatus.UNKNOWN_ROLE, function () {
                        if (!keepAlive && !socket.destroyed) {
                            socket.end();
                        }
                    });

                    return;
                }
                break;

            case fcgi.records.BeginRequest.roles.FILTER:
                if (self.listeners('filter').length < 1) {
                    endRequest(id, 1, fcgi.records.EndRequest.protocolStatus.UNKNOWN_ROLE, function () {
                        if (!keepAlive && !socket.destroyed) {
                            socket.end();
                        }
                    });

                    return;
                }

                break;
            default:
                endRequest(id, 1, fcgi.records.EndRequest.protocolStatus.UNKNOWN_ROLE, function () {
                    if (!keepAlive && !socket.destroyed) {
                        socket.end();
                    }
                });

                return;
            }

            requests[id] = new Request(socket, id, record.role, keepAlive);
        } else {
            if (!(id in requests)) {
                // Invalid request id, ignore record
                self.emit('protocolError', new Error("Request id " + id + " is invalid, ignoring record"));
                return;
            }

            return recordHandler.call(self, socket, requests[id], record);
        }
    });
}

function recordHandler(conn, req, record) {
    switch (record.TYPE) {
    case fcgi.records.AbortRequest.TYPE:
        req._abort();
        return;

    case fcgi.records.Params.TYPE:
        record.params.forEach(function (p) {
            p.length !== p.toString().length ? req._param(p[0], p[1]) : req._param(p.toString(), "");
        });

        if (record.params.length === 0) {
            switch (req._role) {
            case fcgi.records.BeginRequest.roles.RESPONDER:
                req.dataStream._data(null);
                req._dataComplete = true;
                var reqRes = req._createReqRes();
                this.emit('request', reqRes.req, reqRes.res);

                break;

            case fcgi.records.BeginRequest.roles.AUTHORIZER:
                req.dataStream._data(null);
                req._dataComplete = true;
                var reqRes = req._createReqRes();
                this.emit('authorize', reqRes.req, reqRes.res);

                break;

            case fcgi.records.BeginRequest.roles.FILTER:
                var reqRes = req._createReqRes();
                this.emit('filter', reqRes.req, reqRes.res);

                break;
            }
        }

        return;

    case fcgi.records.StdIn.TYPE:
        if (req._stdinComplete) {
            return;
        }

        if (record.data.length > 0) {
            req._data(record.data);
        } else {
            req._data(null);
            req._stdinComplete = true;
            if (req._req) {
                req._req.complete = req._stdinComplete && req._dataComplete;
                // NOTE: Backward compatibility
                if (req._req.complete) {
                    req._req.emit('complete');
                }
            }
        }

        return;

    case fcgi.records.Data.TYPE:
        if (req._dataComplete) {
            return;
        }

        if (record.data.length > 0) {
            req.dataStream._data(record.data);
        } else {
            req.dataStream._data(null);
            req._dataComplete = true;
            if (req._req) {
                req._req.complete = req._stdinComplete && req._dataComplete;
                // NOTE: Backward compatibility
                if (req._req.complete) {
                    req._req.emit('complete');
                }
            }
        }

        return;
    }
}
