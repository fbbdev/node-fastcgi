#!/usr/bin/env node

/**
 * Copyright (c) 2016 Fabio Massaioli, Robert Groh and other contributors
 *
 * Code from Node http module:
 *   Copyright Joyent, Inc. and other Node contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the 'Software'), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';

var path = require('path')
  , fcgiFramework = require('../index.js'); //this we want to test

var port = 8080;
var socketPath = path.join(__dirname, 'echoServer');
try {
  require('fs').unlinkSync(socketPath);
} catch (err) {
  //ignore if file doesn't exists
  if(err.code !== 'ENOENT') {
    throw err;
  }
}

function answerWithError(res, err) {
  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': err.stack.length });
  res.end(err.stack + '\n');
}

fcgiFramework.createServer(
  function echo(req, res) {
    var requestData;

    req.on('data', function (data) {
      requestData = requestData + data;
    });

    req.on('complete', function writeReqAsJson() {
      var echoData
        , size;

      try {
        var strippedRequest = require('lodash').omit(req, 'connection', 'buffer', 'socket', '_events', '_readableState', 'data');
        strippedRequest.data = requestData;

        echoData = JSON.stringify(strippedRequest, null, 4); //hopefully only here will an error be thrown
        size = Buffer.byteLength(echoData, 'utf8');
        res.writeHead(
          200,
          {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': size
          }
        );
        res.end(echoData);
      } catch (err) {
        answerWithError(res, err);
      }
    });

    req.on('error', answerWithError.bind(undefined, res));
  }
).listen(socketPath, function cgiStarted(err) {
  console.log('cgi app listen on socket:' + socketPath);
  if (err) {
    throw err;
  } else {
    var http = require('http');
    var fcgiHandler = require('fcgi-handler');

    var server = http.createServer(function (req, res) {
      fcgiHandler.connect({path: socketPath}, function (err, fcgiProcess) {
        if (err) {
          throw err;
        } else {
          //route all request to fcgi application
          fcgiProcess.handle(req, res, {/*empty Options*/});
        }
      });
    });
    server.listen(port);
  }
});
