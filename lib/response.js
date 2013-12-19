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

var http = require('http')
  , util = require('util')
  , fcgi = require('fastcgi-stream')
  , OutputStream = require('./streams.js').OutputStream;

var CRLF = '\r\n';
var STATUS_CODES = http.STATUS_CODES;

exports.Response = Response;
exports.AuthorizerResponse = AuthorizerResponse;
exports.FilterResponse = Response;

/**
 * function Response(conn, req)
 * Generic FastCGI Response. Compatible with http.ServerResponse
 */

function Response(conn, req) {
  if (!(this instanceof Response))
    return new Response(conn, req);

  http.OutgoingMessage.call(this);

  this.conn = conn;
  this.stdout = new OutputStream(conn, req, this);
  this.stderr = new OutputStream(conn, req, this, fcgi.records.StdErr);

  var self = this;

  function onCloseRequest() {
    if (self.stdout._open) {
      self.stdout.close();
      self.stderr.close();
      delete self.connection;
      req.removeListener('close', onCloseRequest);
      self.emit('close');
    }
  }

  this.on('finish', function() {
    self.conn.stream.writeRecord(
      req.id,
      new fcgi.records.EndRequest(
        0, fcgi.records.EndRequest.protocolStatus.REQUEST_COMPLETE),
      function() {
        self.stdout.close();
        self.stderr.close();
        delete self.connection;
        req.removeListener('close', onCloseRequest);
        req.close();
      }
    );
  });

  this.on('finish', this.removeAllListeners);
  this.on('close', this.removeAllListeners);

  req.on('close', onCloseRequest);

  if (req.method === 'HEAD') this._hasBody = false;
  this.sendDate = false;
  this.statusCode = 200;
  this.useChunkedEncodingByDefault = false;
  this.shouldKeepAlive = (req.headers['connection'] !== 'close');
  this._expectContinue = false;

  // NOTE: http.OutgoingMessage needs this.connection = this.socket = output buffer
  this.connection = this.socket = this.stdout;
  // NOTE: http.ServerResponse emits a 'socket' event to complete OutgoingMessage initialization
  this.emit('socket', this.stdout);
  this._flush();
}
util.inherits(Response, http.OutgoingMessage);

Response.prototype.writeContinue = function() { // NOTE: useless/dangerous in CGI/FastCGI app
  this._writeRaw('Status: 100 Continue' + CRLF + CRLF, 'ascii');
  this._sent100 = true;
};

Response.prototype._implicitHeader = function() {
  this.writeHead(this.statusCode);
};

Response.prototype.writeHead = function(statusCode) {
  var reasonPhrase, headers, headerIndex;

  if (typeof arguments[1] == 'string') {
    reasonPhrase = arguments[1];
    headerIndex = 2;
  } else {
    reasonPhrase = STATUS_CODES[statusCode] || 'unknown';
    headerIndex = 1;
  }
  this.statusCode = statusCode;

  var obj = arguments[headerIndex];

  if (obj && this._headers) {
    // Slow-case: when progressive API and header fields are passed.
    headers = this._renderHeaders();

    if (Array.isArray(obj)) {
      // handle array case
      // TODO: remove when array is no longer accepted
      var field;
      for (var i = 0, len = obj.length; i < len; ++i) {
        field = obj[i][0];
        if (headers[field] !== undefined) {
          obj.push([field, headers[field]]);
        }
      }
      headers = obj;

    } else {
      // handle object case
      var keys = Object.keys(obj);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k) headers[k] = obj[k];
      }
    }
  } else if (this._headers) {
    // only progressive api is used
    headers = this._renderHeaders();
  } else {
    // only writeHead() called
    headers = obj;
  }

  var statusLine = 'Status: ' + statusCode.toString() + ' ' +
                   reasonPhrase + CRLF;

  if (statusCode === 204 || statusCode === 304 ||
      (100 <= statusCode && statusCode <= 199)) {
    // RFC 2616, 10.2.5:
    // The 204 response MUST NOT include a message-body, and thus is always
    // terminated by the first empty line after the header fields.
    // RFC 2616, 10.3.5:
    // The 304 response MUST NOT contain a message-body, and thus is always
    // terminated by the first empty line after the header fields.
    // RFC 2616, 10.1 Informational 1xx:
    // This class of status code indicates a provisional response,
    // consisting only of the Status-Line and optional headers, and is
    // terminated by an empty line.
    this._hasBody = false;
  }

  // don't keep alive connections where the client expects 100 Continue
  // but we sent a final status; they may put extra bytes on the wire.
  if (this._expect_continue && !this._sent100) {
    this.shouldKeepAlive = false;
  }

  this._storeHeader(statusLine, headers);
};

Response.prototype.writeHeader = function() {
  this.writeHead.apply(this, arguments);
};

Response.prototype._finish = function() { // NOTE: overloading to avoid fatal assert(this instanceof ClientRequest)
  if (!this.connection)
    throw Error("Cannot emit finish on closed response");
  this.emit('finish');
};

/**
 * function AuthorizerResponse(conn, req)
 * FastCGI authorizer response. Compatible with http.ServerResponse
 * This object has three special methods:
 *   - function setVariable(name, value): translates to setHeader('Variable-' + name, value)
 *   - function allow(): calls end() with status code 200 and no body
 *   - function deny(): calls end() with status code 403 and no body
 */

function AuthorizerResponse(conn, req) {
  if (!(this instanceof AuthorizerResponse))
    return new AuthorizerResponse(conn, req);

  Response.call(this, conn, req);
  this.setHeader('Content-type', 'text/plain');
}
util.inherits(AuthorizerResponse, Response);

AuthorizerResponse.prototype.setVariable = function(name, value) {
  this.setHeader('Variable-' + name, value);
};

AuthorizerResponse.prototype.allow = function() {
  this.statusCode = 200;
  this.end();
};

AuthorizerResponse.prototype.deny = function() {
  this.statusCode = 403;
  this.end();
};
