/**
 * Copyright (c) 2013 Fabio Massaioli
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

var net = require('net')
  , util = require('util')
  , fcgi = require('fastcgi-stream')
  , Request = require('./request.js').Request
  , response = require('./response.js');

var Response = response.Response;
var AuthorizerResponse = response.AuthorizerResponse;
var FilterResponse = response.FilterResponse;

exports.Server = Server;

var VALUE_MAP = {
  'FCGI_MAX_CONNS': 'maxConns',
  'FCGI_MAX_REQS': 'maxReqs',
  'FCGI_MPXS_CONNS': 'multiplex'
};

function isfunction(obj) {
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
  if (!(this instanceof Server))
    return new Server(responder, authorizer, filter, config);

  net.Server.call(this, { allowHalfOpen: false });

  if (isfunction(responder)) this.on('request', responder);
  else if (responder) config = responder;

  if (isfunction(authorizer)) this.on('authorize', authorizer);
  else if (authorizer) config = authorizer;

  if (isfunction(filter)) this.on('filter', filter);
  else if (filter) config = filter;

  config = config || {}
  config.maxConns = parseInt(config.maxConns) || 2000;
  config.maxReqs = parseInt(config.maxReqs) || 10;
  if (config.multiplex === undefined) config.multiplex = 1;
  else config.multiplex = config.multiplex ? 1 : 0;

  config.valueMap = config.valueMap || {};
  for (var v in VALUE_MAP) {
    config.valueMap[v] = VALUE_MAP[v];
  }

  this.config = config;
  this.connectionsMap = {};
  this.maxHeadersCount = 0;
  this.timeout = 120000;

  this.on('connection', connectionListener);
}
util.inherits(Server, net.Server);

/**
 * server.listen = function()
 * Starts listening on default FastCGI socket.
 * Forwards to net.Server.listen if called with arguments.
 */

Server.prototype.listen = function() {
  if (arguments.length > 0)
    return net.Server.prototype.listen.apply(this, arguments);

  return net.Server.prototype.listen.call(this, { fd: 0 });
};

Server.prototype.setTimeout = function(msecs, callback) {
  if (callback) this.on('timeout', callback);

  this.timeout = msecs;
  for (var s in this.connectionsMap)
    s.setTimeout(msecs);
};

function connectionListener(socket) {
  var conn = {
    socket: socket,
    stream: new fcgi.FastCGIStream(socket),
    requests: {}
  };

  conn.stream.on('record', function(id, record) {
    return recordHandler.call(self, conn, id, record);
  });

  var self = this;

  socket.on('error', function(err) {
    this.destroy(err);
    self.emit('clientError', err, this);
  });

  socket.setTimeout(this.timeout, function() {
    self.emit('timeout', this);
  });

  socket.on('close', function() {
    conn.stream.removeAllListeners('record');
    for (var id in conn.requests)
      conn.requests[id].close();

    for (var el in conn) delete conn[el];
    delete self.connectionsMap[this];
  });

  this.connectionsMap[socket] = conn;
}

function recordHandler(conn, id, record) {
  var self = this;
  if (record.TYPE == fcgi.records.GetValues.TYPE) {
    var result = [];

    record.values.forEach(function(v) {
      if (v in self.config.valueMap) result.push([v, self.config[self.config.valueMap[v]].toString()]);
    });

    conn.stream.writeRecord(id, new fcgi.records.GetValuesResult(result));
  } else if (record.TYPE == fcgi.records.BeginRequest.TYPE) {
    if (id in conn.requests) {
      // Request id already in use
       self.emit('protocolError', new Error("Request id " + id + " already in use"));
      return;
    }

    if (!this.config.multiplex && conn.requests.length > 0) {
      conn.stream.writeRecord(
        id,
        new fcgi.records.EndRequest(
          1, fcgi.records.EndRequest.protocolStatus.CANT_MPX_CONN)
      );
      return;
    }

    if (conn.requests.length > this.config.maxReqs) {
      conn.stream.writeRecord(
        id,
        new fcgi.records.EndRequest(
          1, fcgi.records.EndRequest.protocolStatus.OVERLOADED)
      );
      return;
    }

    var keepalive = record.flags & fcgi.records.BeginRequest.flags.KEEP_CONN;

    switch (record.role) {
      case fcgi.records.BeginRequest.roles.RESPONDER:
        if (self.listeners('request').length < 1) {
          conn.stream.writeRecord(
            id,
            new fcgi.records.EndRequest(
              1, fcgi.records.EndRequest.protocolStatus.UNKNOWN_ROLE)
          );

          if (!keepalive) conn.socket.end();
          return;
        }
        break;
      case fcgi.records.BeginRequest.roles.AUTHORIZER:
        if (self.listeners('authorize').length < 1) {
          conn.stream.writeRecord(
            id,
            new fcgi.records.EndRequest(
              1, fcgi.records.EndRequest.protocolStatus.UNKNOWN_ROLE)
          );

          if (!keepalive) conn.socket.end();
          return;
        }
        break;
      case fcgi.records.BeginRequest.roles.FILTER:
        if (self.listeners('filter').length < 1) {
          conn.stream.writeRecord(
            id,
            new fcgi.records.EndRequest(
              1, fcgi.records.EndRequest.protocolStatus.UNKNOWN_ROLE)
          );

          if (!keepalive) conn.socket.end();
          return;
        }
        break;
      default:
        conn.stream.writeRecord(
          id,
          new fcgi.records.EndRequest(
            1, fcgi.records.EndRequest.protocolStatus.UNKNOWN_ROLE)
        );

        if (!keepalive) conn.socket.end();
        return;
    }

    conn.requests[id] = new Request(
      conn,
      id,
      record.role,
      keepalive
    );
  } else {
    if (!(id in conn.requests)) {
      // Invalid request id, ignore record
      self.emit('protocolError', new Error("Request id " + id + " is invalid, ignoring record"));
      return;
    }

    return roleHandler.call(self, conn, conn.requests[id], record);
  }
}

function roleHandler(conn, req, record) {
  req._resetTimeout();

  switch (record.TYPE) {
    case fcgi.records.AbortRequest.TYPE:
      conn.stream.writeRecord(
        req.id,
        new fcgi.records.EndRequest(
          0, fcgi.records.EndRequest.protocolStatus.REQUEST_COMPLETE)
      );

      req.close();
      return;

    case fcgi.records.Params.TYPE:
      record.params.forEach(function(p) {
        p.length !== p.toString().length ? req._param(p[0], p[1]) : req._param(p.toString(), "");
      });

      if (record.params.length === 0) {
        switch (req.role) {
          case fcgi.records.BeginRequest.roles.RESPONDER:
            req.data.append(null);
            req._dataComplete = true;
            req.emit('paramsComplete');
            this.emit('request', req, new Response(conn, req));
            break;
          case fcgi.records.BeginRequest.roles.AUTHORIZER:
            req.data.append(null);
            req._dataComplete = true;
            req.emit('paramsComplete');
            this.emit('authorize', req, new AuthorizationResponse(conn, req));
            break;
          case fcgi.records.BeginRequest.roles.FILTER:
            req.emit('paramsComplete');
            this.emit('filter', req, new FilterResponse(conn, req));
            break;
        }
      }

      return;

    case fcgi.records.StdIn.TYPE:
      if (req._stdinComplete) return;
      if (record.data.length > 0) {
          req.append(record.data);
      } else {
        req.append(null);
        req._stdinComplete = true;
        req.complete = req._stdinComplete && req._dataComplete;
        if (req.complete) req.emit('complete');
      }
      return;

    case fcgi.records.Data.TYPE:
      if (req._dataComplete) return;
      if (record.data.length > 0) {
        req.data.append(record.data);
      } else {
        req.data.append(null);
        req._dataComplete = true;
        req.complete = req._stdinComplete && req._dataComplete;
        if (req.complete) req.emit('complete');
      }
      return;
  }
}
