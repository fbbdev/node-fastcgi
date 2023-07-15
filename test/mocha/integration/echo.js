/**
 * Copyright (c) 2023 Fabio Massaioli, Robert Groh and other contributors
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

const fcgiHandler = require('fcgi-handler'),
      http = require('http'),
      expect = require('chai').expect;

let fetch;
fetch = async (...args) => {
    fetch = (await import('node-fetch')).default;
    return fetch(...args);
};

const fcgi = require('../../../index.js');

function timeoutSignal(ms) {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
}

describe('echo server', function setup() {
    let httpURL;

    before(function startFcgiServer(done) {
        function sendError(res, err) {
            res.writeHead(500, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Length': err.stack.length + 1
            });
            res.end(err.stack + '\n');
        }

        const fcgiServer = fcgi.createServer(function echo(req, res) {
            let reqBody = "";

            req.on('data', (data) => { reqBody += data.toString(); });

            req.on('end', () => {
                try {
                    const resBody = JSON.stringify({
                        method: req.method,
                        url: req.url,
                        headers: req.headers,
                        cgiParams: req.socket.params,
                        body: reqBody
                    });
                    const length = Buffer.byteLength(resBody, 'utf8');

                    res.writeHead(200, {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Content-Length': length
                    });
                    res.end(resBody);
                } catch (err) {
                    sendError(res, err);
                }
            });

            req.on('error', sendError.bind(null, res));
        });

        fcgiServer.listen(0, '127.0.0.1', function startHttpServer(err) {
            if (err) {
                done(err);
                return;
            }

            const fcgiAddr = fcgiServer.address();
            console.log(`fcgi server listening at ${fcgiAddr.address}:${fcgiAddr.port}`);

            const httpServer = http.createServer((req, res) => {
                fcgiHandler.connect(fcgiAddr, (err, fcgiProcess) => {
                    if (err)
                        sendError(res, err);
                    else
                        fcgiProcess.handle(req, res, {});
                });
            });

            httpServer.listen(0, '127.0.0.1', (err) => {
                if (err) {
                    done(err);
                    return;
                }

                const httpAddr = httpServer.address();
                console.log(`http server listening at ${httpAddr.address}:${httpAddr.port}`);

                httpURL = new URL(`http://${httpAddr.address}:${httpAddr.port}`);

                done();
            });
        });
    });

    it('should answer with the request', async () => {
        const res = await fetch(httpURL, { signal: timeoutSignal(1000) });

        expect(res.status).to.be.equal(200);
        expect(res.headers.get('Content-Type')).to.be.equal("application/json; charset=utf-8");

        const echo = await res.json();
        expect(echo).to.have.nested.property('cgiParams.PATH_INFO', '/');
        expect(echo).to.have.nested.property('cgiParams.SERVER_PROTOCOL', 'HTTP/1.1');
        expect(echo).to.have.nested.property('cgiParams.SERVER_SOFTWARE', 'Node/' + process.version);
        expect(echo).to.have.nested.property('cgiParams.REQUEST_METHOD', 'GET');
        expect(echo).to.have.nested.property('cgiParams.QUERY_STRING', '');
        expect(echo).to.have.nested.property('cgiParams.HTTP_HOST', httpURL.host);
        expect(echo).to.have.nested.property('method', 'GET');
        expect(echo).to.have.nested.property('url', '/');
    });

    it('should answer with the request data', async () => {
        const reqPath = '/push/something/here';
        const reqBody = 'Some data.';

        const res = await fetch(new URL(reqPath, httpURL), {
            method: 'POST',
            body: reqBody,
            signal: timeoutSignal(1000)
        });

        expect(res.status).to.be.equal(200);
        expect(res.headers.get('Content-Type')).to.be.equal("application/json; charset=utf-8");

        const echo = await res.json();
        expect(echo).to.have.nested.property('cgiParams.PATH_INFO', reqPath);
        expect(echo).to.have.nested.property('cgiParams.REQUEST_METHOD', 'POST');
        expect(echo).to.have.nested.property('method', 'POST');
        expect(echo).to.have.nested.property('url', reqPath);
        expect(echo).to.have.nested.property('body', reqBody);
    });

    it('should answer with the request querystring', async () => {
        const reqPath = '/query/something';

        const reqURL = new URL(reqPath, httpURL);
        reqURL.searchParams.set('a', 'b');
        reqURL.searchParams.set('ca', 'd');

        const res = await fetch(reqURL, { signal: timeoutSignal(1000) });

        expect(res.status).to.be.equal(200);
        expect(res.headers.get('Content-Type')).to.be.equal("application/json; charset=utf-8");

        const echo = await res.json();
        expect(echo).to.have.nested.property('cgiParams.PATH_INFO', reqPath);
        expect(echo).to.have.nested.property('cgiParams.QUERY_STRING', reqURL.searchParams.toString());
        expect(echo).to.have.nested.property('url', `${reqURL.pathname}${reqURL.search}`);
    });

    it('should answer with the request auth', async () => {
        const authHdr = `Basic ${Buffer.from("ArthurDent:I think I'm a sofa...").toString('base64')}`;

        const res = await fetch(httpURL, {
            headers: { 'Authorization': authHdr },
            signal: timeoutSignal(1000)
        });

        expect(res.status).to.be.equal(200);
        expect(res.headers.get('Content-Type')).to.be.equal("application/json; charset=utf-8");

        const echo = await res.json();
        expect(echo).to.have.nested.property('headers.authorization', authHdr);
    });

    it('should answer with correct request header names', async () => {
        const hdr1 = 'test1', hdr2 = 'test2';
        const reqBody = 'Some data.';
        const length = Buffer.byteLength(reqBody, 'utf8');

        const res = await fetch(httpURL, {
            method: 'PUT',
            headers: {
                'x_testhdr': hdr1,    // XXX: Using underscores because fcgi-handler
                'x_test_hdr': hdr2,   //      passes hyphens in CGI params
                'Content-Type': "text/plain"
            },
            body: reqBody,
            signal: timeoutSignal(1000)
        });

        expect(res.status).to.be.equal(200);
        expect(res.headers.get('Content-Type')).to.be.equal("application/json; charset=utf-8");

        const echo = await res.json();
        expect(echo).to.have.nested.property('headers.x-testhdr', hdr1);
        expect(echo).to.have.nested.property('headers.x-test-hdr', hdr2);
        expect(echo).to.have.nested.property('headers.content-length', Buffer.byteLength(reqBody, 'utf8').toString());
        expect(echo).to.have.nested.property('headers.content-type', "text/plain");
        expect(echo).to.have.nested.property('method', 'PUT');
    });
});
