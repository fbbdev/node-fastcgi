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

var stream = require('stream'),
    util = require('util'),
    fcgi = require('fastcgi-stream');

exports.InputStream = InputStream;
exports.OutputStream = OutputStream;
exports.IOStream = IOStream;

/**
 * function InputStream([buffer])
 * Readable stream interface for FastCGI input streams
 */

function InputStream() {
    stream.Readable.call(this);

    this._buffer = [];
    this._canPush = false;
}
util.inherits(InputStream, stream.Readable);

InputStream.prototype._data = function (chunk) {
    if (this.closed || this.destroyed)
        return;

    if (this._canPush) {
        this._canPush = this.push(chunk);
    } else {
        this._buffer.push(chunk);
    }
};

InputStream.prototype._read = function (size) {
    this._canPush = true;
    while (this._buffer.length && (this._canPush = this.push(this._buffer.shift())));
};

InputStream.prototype._destroy = function (err, callback) {
    this._buffer = [];
    this._canPush = false;
    callback(err);
}

/**
 * function OutputStream(conn, type)
 * Writable stream interface for FastCGI output streams
 */

function OutputStream(conn, id, recordType) {
    stream.Writable.call(this);

    this.recordType = recordType || fcgi.records.StdOut;

    this._conn = conn;
    this._id = id;

    this._finalized = false;
}
util.inherits(OutputStream, stream.Writable);

OutputStream.prototype._write = function (chunk, encoding, callback) {
    var start = 0;
    var self = this;

    function writeSubChunk(err) {
        if (err || start >= chunk.length) {
            callback(err);
            return;
        }

        self._conn.stream.writeRecord(
            self._id,
            new self.recordType(chunk.subarray(start, Math.min(start += 65535, chunk.length))),
            writeSubChunk);
    }

    writeSubChunk();
};

OutputStream.prototype._final = function (callback) {
    this._finalized = true;
    this._conn.stream.writeRecord(this._id, new this.recordType(), callback);
}

OutputStream.prototype._destroy = function (err, callback) {
    if (!this._finalized) {
        this._conn.stream.writeRecord(this._id, new this.recordType(), function () {
            callback(err);
        });
    } else {
        callback(err);
    }
}

/**
 * function IOStream([buffer])
 * Duplex stream interface for FastCGI input streams
 */

function IOStream(conn, id, recordType) {
    stream.Duplex.call(this);

    this._buffer = [];
    this._canPush = false;

    this.recordType = recordType || fcgi.records.StdOut;

    this._conn = conn;
    this._id = id;

    this._finalized = false;
}
util.inherits(IOStream, stream.Duplex);

IOStream.prototype._data = InputStream.prototype._data;
IOStream.prototype._read = InputStream.prototype._read;

IOStream.prototype._write = OutputStream.prototype._write;
IOStream.prototype._final = OutputStream.prototype._final;

IOStream.prototype._destroy = function (err, callback) {
    InputStream.prototype._destroy.call(this, err,
        OutputStream.prototype._destroy.bind(this, err, callback));
}
