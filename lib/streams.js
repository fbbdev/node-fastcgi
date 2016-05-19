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

var stream = require('stream'),
    util = require('util'),
    fcgi = require('fastcgi-stream');

exports.InputStream = InputStream;
exports.OutputStream = OutputStream;

/**
 * function InputStream([buffer])
 * Readable stream interface for FastCGI input streams
 */

function InputStream() {
    stream.Readable.call(this);

    this._buffer = [];
    this._canPush = true;
}
util.inherits(InputStream, stream.Readable);

InputStream.prototype._data = function (chunk) {
    if (this._canPush) {
        this._canPush = this.push(chunk);
    } else {
        this._buffer.push(chunk);
    }
};

InputStream.prototype._read = function (size) {
    while (this._buffer.length && (this._canPush = this.push(this._buffer.shift())));
};

/**
 * function OutputStream(conn, type)
 * Writable stream interface for FastCGI output streams
 */

function OutputStream(conn, id, recordType) {
    stream.Writable.call(this);

    this.recordType = recordType || fcgi.records.StdOut;

    this._conn = conn;
    this._id = id;

    this._open = true;
}
util.inherits(OutputStream, stream.Writable);

OutputStream.prototype.close = function () {
    this._open = false;
    this.emit('close');
};

OutputStream.prototype._write = function (chunk, encoding, callback) {
    if (!this._open) {
        callback(new Error("Output stream is not open"));
        return;
    }

    var chunks = [];

    if (!Buffer.isBuffer(chunk)) {
        chunk = new Buffer(chunk, encoding);
    }

    if (chunk.length <= 65535) {
        chunks.push(chunk);
    } else {
        var splits = Math.floor(chunk.length / 65535);
        var start = 0;
        for (var i = 0; i < splits; ++i) {
            chunks.push(chunk.slice(start, start += 65535));
        }
        chunks.push(chunk.slice(start, chunk.length));
    }

    while (chunks.length > 1) {
        this._conn.stream.writeRecord(this._id, new this.type(chunks.shift()));
    }

    this._conn.stream.writeRecord(
        this._id,
        new this.type(chunks.shift()),
        callback.bind(this));
};

/**
 * function IOStream([buffer])
 * Duplex stream interface for FastCGI input streams
 */

function IOStream(conn, id, recordType) {
    stream.Duplex.call(this);

    this.recordType = recordType || fcgi.records.StdOut;

    this._buffer = [];
    this._canPush = true;

    this._conn = conn;
    this._id = id;

    this._open = true;
}
util.inherits(IOStream, stream.Duplex);

IOStream.prototype._data = InputStream.prototype._data;
IOStream.prototype._read = InputStream.prototype._read;

IOStream.prototype.close = OutputStream.prototype.close;
IOStream.prototype._write = OutputStream.prototype._write;
