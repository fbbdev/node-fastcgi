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

var util = require('util')
  , InputStream = require('./streams.js').InputStream;

exports.Request = Request;

/**
 * function Request(conn, id, role, keepalive)
 * FastCGI request object. Compatible with http.IncomingMessage
 */

function Request(conn, id, role, keepalive) {
  if (!(this instanceof Request))
    return new Request(conn, id, role, keepalive);

  InputStream.call(this);

  this.id = id;
  this.role = role;
  this.keepalive = keepalive;
  this.connection = conn;
  this.timeout = 0;

  this.cgiParams = {};
  this.data = new InputStream(); // NOTE: data stream for filter requests

  this.httpVersion = null;
  this.url = '';
  this.method = null;
  this.headers = {};
  this.trailers = {}; // NOTE: Provided for http.IncomingMessage compatibility: CGI Spec does not allow trailers
  this.contentLength = 0;

  this.readable = true;
  this.complete = false;

  // NOTE: not a real socket, provided for http.IncomingMessage compatibility
  this.socket = {
    setEncoding: conn.socket.setEncoding.bind(conn.socket),
    setTimeout: conn.socket.setTimeout.bind(conn.socket),
    setKeepAlive: conn.socket.setKeepAlive.bind(conn.socket),
    remoteAddress: null,
    remotePort: null,
    localAddress: null,
    localPort: null,
    get bytesRead() { return conn.socket.bytesRead; },
    get bytesWritten() { return conn.socket.bytesWritten; }
  };

  this.on('close', this.removeAllListeners);
}
util.inherits(Request, InputStream);

Request.headerExpression = /^HTTP_/;

Request.prototype.close = function() {
  delete this.connection.requests[this.id];
  if (!this.keepalive) this.connection.socket.end();

  delete this.connection;

  this.emit('close');
};

Request.prototype._param = function(name, value) {
  this.cgiParams[name] = value;

  function makeUrl() {
    this.url = '';
    if (this._scriptName) this.url += this._scriptName;
    if (this._pathInfo) this.url += this._pathInfo;
    if (this._queryString) this.url += '?' + this._queryString;
  }

  if (Request.headerExpression.test(name)) {
    field = name.slice(5).replace('_', '-').toLowerCase();
    if (this.headers[field] === undefined) this.headers[field] = value;
  }

  else if (name === 'CONTENT_LENGTH') {
    this.headers['content-length'] = value;
    this.contentLength = parseInt(value);
  }
  else if (name === 'CONTENT_TYPE')
    this.headers['content-type'] = value;

  else if (name === 'REMOTE_ADDR')
    this.socket.remoteAddress = value;
  else if (name === 'REMOTE_PORT')
    this.socket.remotePort = parseInt(value);
  else if (name === 'SERVER_ADDR')
    this.socket.localAddress = value;
  else if (name === 'SERVER_PORT')
    this.socket.localPort = parseInt(value);

  else if (name === 'SERVER_PROTOCOL') {
    this.httpVersion = value.slice(5);
    numbers = this.httpVersion.split('.');
    this.httpVersionMajor = parseInt(numbers[0]);
    this.httpVersionMinor = parseInt(numbers[1]);
  }

  else if (name === 'REQUEST_METHOD')
    this.method = value;
  else if (name === 'SCRIPT_NAME') {
    this._scriptName = value;
    makeUrl.call(this);
  }
  else if (name === 'PATH_INFO') {
    this._pathInfo = value;
    makeUrl.call(this);
  }
  else if (name === 'QUERY_STRING') {
    this._queryString = value;
    makeUrl.call(this);
  }
};

Request.prototype.setTimeout = function(msecs, callback) {
  if (this._timeout_ref) {
    clearTimeout(this._timeout_ref);
  }

  this.timeout = msecs;
  if (callback) this.on('timeout', callback);

  if (msecs > 0) this._timeout_ref = setTimeout(function(self) {
    self.emit('timeout');
  }, msecs, this);
  else this._timeout_ref = undefined;
};

Request.prototype._resetTimeout = function() {
  if (this.timeout || this._timeout_ref) {
    if (this._timeout_ref) clearTimeout(this._timeout_ref);
    if (this.timeout > 0) {
      this._timeout_ref = setTimeout(function(self) {
        self.emit('timeout');
      }, this.timeout, this);
    } else this._timeout_ref = undefined;
  }
};
