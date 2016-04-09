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
/*global describe, it, before, after */
/*jshint node: true */
/*jshint expr: true*/

var expect = require('chai').expect
  , request = require('request')
  , path = require('path');

var fcgiFramework = require('../../../index.js'); //this we want to test

function randomInt(low, high) {
  return Math.floor(Math.random() * (high - low + 1) + low);
}


describe('echo Server', function setup() {
  var port = 0, //will choose a random (and hopefully free) port
      socketPath = path.join(__dirname, 'echoServer_Socket' + randomInt(1000, 2000));

  before(function startFastCgiApplication(done) {
    function answerWithError(res, err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': err.stack.length });
      res.end(err.stack + '\n');
    }

    fcgiFramework.createServer(
      function echo(req, res) {
        var requestData;

        req.on('data', function (data) {
          if (requestData === undefined) {
            requestData =  data.toString();
          } else {
            requestData = requestData + data.toString();
          }
        });

        req.on('end', function writeReqAsJson() {
          var echoData
          , size
          , strippedRequest = require('lodash').omit(req, 'connection', 'buffer', 'socket', '_events', '_readableState', 'data');

          strippedRequest.data = requestData;

          try {
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
      if (err) {
        done(err);
      } else {
        console.log('cgi app listen on socket:' + socketPath);

        var http = require('http');
        var fcgiHandler = require('fcgi-handler');

        var server = http.createServer(function (req, res) {
          fcgiHandler.connect({path: socketPath}, function (err, fcgiProcess) {
            if (err) {
              answerWithError(res, err);
            } else {
              //route all request to fcgi application
              fcgiProcess.handle(req, res, {/*empty Options*/});
            }
          });
        });
        server.listen(port, function httpServerStarted(err) {
          port = server.address().port;
          done(err);
        });
      }
    });
  });

  it('should answer with the request', function checkResponse(done) {
    request({
      uri: 'http://localhost:' + port,
      method: 'GET'
    }, function (err, res, body) {
      expect(res.statusCode).to.be.equal(200);
      expect(res.headers['content-type']).to.be.equal('application/json; charset=utf-8');

      var echo = JSON.parse(body);
      expect(echo).to.have.deep.property('cgiParams.PATH_INFO', '/');
      expect(echo).to.have.deep.property('cgiParams.SERVER_PROTOCOL', 'HTTP/1.1');
      expect(echo).to.have.deep.property('cgiParams.SERVER_SOFTWARE', 'Node/' + process.version);
      expect(echo).to.have.deep.property('cgiParams.REQUEST_METHOD', this.method);
      expect(echo).to.have.deep.property('cgiParams.QUERY_STRING', '');
      expect(echo).to.have.deep.property('cgiParams.HTTP_HOST', 'localhost:' + port);

      done(err);
    });
  });

  it('should answer with the request data', function checkResponse(done) {
    var requestPath = '/push/somthing/here';

    request({
      baseUrl : 'http://localhost:' + port,
      url: requestPath,
      method: 'POST',
      body: 'Some data.'
    }, function (err, res, body) {
      expect(res.statusCode).to.be.equal(200);
      expect(res.headers['content-type']).to.be.equal('application/json; charset=utf-8');

      var echo = JSON.parse(body);
      expect(echo).to.have.deep.property('cgiParams.PATH_INFO', requestPath);
      expect(echo).to.have.deep.property('cgiParams.REQUEST_METHOD', this.method);
      expect(echo).to.have.deep.property('data', this.body.toString());

      done(err);
    });
  });

  it('should answer with the request querystring', function checkResponse(done) {
    var requestPath = '/query/something';

    request({
      baseUrl : 'http://localhost:' + port,
      url: requestPath,
      method: 'GET',
      qs: { a: 'b', ca: 'd'}
    }, function (err, res, body) {
      expect(res.statusCode).to.be.equal(200);
      expect(res.headers['content-type']).to.be.equal('application/json; charset=utf-8');

      var echo = JSON.parse(body);
      expect(echo).to.have.deep.property('cgiParams.PATH_INFO', requestPath);
      expect(echo).to.have.deep.property('_queryString', 'a=b&ca=d');

      done(err);
    });
  });

  it('should answer with the request auth', function checkResponse(done) {

    request({
      uri : 'http://localhost:' + port,
      method: 'GET',
      auth: {
        user: 'ArthurDent',
        pass: 'I think I\'m a sofa...'
      }
    }, function (err, res, body) {
      expect(res.statusCode).to.be.equal(200);
      expect(res.headers['content-type']).to.be.equal('application/json; charset=utf-8');

      var echo = JSON.parse(body);
      expect(echo).to.have.deep.property('headers.authorization', 'Basic QXJ0aHVyRGVudDpJIHRoaW5rIEknbSBhIHNvZmEuLi4=');

      done(err);
    });
  });

  it('should answer with correct request header names', function checkResponse(done) {
    var hdr1 = 'test1',
        hdr2 = 'test2';

    request({
      uri: 'http://localhost:' + port,
      method: 'GET',
      headers: {
          'x_testhdr': hdr1, // XXX: Using underscores because fcgi-handler
          'x_test_hdr': hdr2 //      passes hyphens in CGI params
      }
    }, function (err, res, body) {
      expect(res.statusCode).to.be.equal(200);
      expect(res.headers['content-type']).to.be.equal('application/json; charset=utf-8');

      var echo = JSON.parse(body);
      expect(echo).to.have.deep.property('headers.x-testhdr', hdr1);
      expect(echo).to.have.deep.property('headers.x-test-hdr', hdr2);

      done(err);
    });
  });

  after(function removeSocketPath(done) {
    require('fs').unlink(socketPath, done);
  });
});
