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

var stream = require('stream')
  , util = require('util')
  , fcgi = require('fastcgi-stream');

exports.InputStream = InputStream;
exports.OutputStream = OutputStream;

/**
 * function InputStream([buffer])
 * Readable stream interface for buffer arrays
 */

function InputStream(buffer) {
  if (!(this instanceof InputStream))
    return new InputStream(array);

  stream.Readable.call(this);

  this.buffer = buffer || [];
  this.writable = true;
}
util.inherits(InputStream, stream.Readable);

InputStream.prototype.append = function(chunk) {
  if (this.writable)
    this.writable = this.push(chunk);
  else
    this.buffer.push(chunk);
};

InputStream.prototype._read = function(size) {
  while (this.buffer.length && (this.writable = this.push(this.buffer.shift())));
};

/**
 * function OutputStream(conn, req, res, type)
 * Writable stream interface for FastCGI output streams
 */

function OutputStream(conn, req, res, type) {
  if (!(this instanceof OutputStream))
    return new OutputStream(conn, req, res, type);

  stream.Writable.call(this);

  this.conn = conn;
  this.req = req;
  this.res = this._httpMessage = res; // NOTE: http.OutgoingMessage needs connection._httpMessage = response
  this.type = type || fcgi.records.StdOut;

  this.timeout = 0;

  // NOTE: http.OutgoingMessage needs connection.writable = true
  this._open = this.writable = true;
  this.on('drain', this.res.emit.bind(res, 'drain'));
}
util.inherits(OutputStream, stream.Writable);

OutputStream.prototype.close = function() {
  this._open = this.writable = false;
  this.emit('close');
};

OutputStream.prototype.setTimeout = function(msecs, callback) {
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

OutputStream.prototype._resetTimeout = function() {
  if (this.timeout || this._timeout_ref) {
    if (this._timeout_ref) clearTimeout(this._timeout_ref);
    if (this.timeout > 0) {
      this._timeout_ref = setTimeout(function(self) {
        self.emit('timeout');
      }, this.timeout, this);
    } else this._timeout_ref = undefined;
  }
};

OutputStream.prototype._write = function(chunk, encoding, callback) {
  if (!this._open) {
    callback(new Error("Output stream is not open"));
    return;
  }

  var chunks = [];

  this._resetTimeout();

  if (!Buffer.isBuffer(chunk)) chunk = new Buffer(chunk, encoding);

  if (chunk.length <= 65535) chunks.push(chunk);
  else {
    var splits = Math.floor(chunk.length/65535);
    var start = 0;
    for (var i = 0; i < splits; ++i) {
      chunks.push(chunk.slice(start, start+=65535));
    }
    chunks.push(chunk.slice(start, chunk.length));
  }

  while (chunks.length > 1) {
      this.conn.stream.writeRecord(
        this.req.id,
        new this.type(chunks.shift())
      );
  }

  this.conn.stream.writeRecord(
    this.req.id,
    new this.type(chunks.shift()),
    callback.bind(this)
  );
};
